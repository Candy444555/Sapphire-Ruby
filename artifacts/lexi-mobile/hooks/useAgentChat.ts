import { useState, useRef, useCallback, useEffect } from "react";
import {
  runLocalAgentTools,
  termCreateSession,
  termDestroySession,
  termExec,
  type AgentRawEvent,
  type ChatMsg,
} from "@/lib/lexi-api";
import { explainLexiError } from "@/lib/lexi-error-explainer";
import { ensureLocalModelReady } from "@/lib/local-agent-model";
import {
  completeLocalAgent,
  splitLocalAgentCommandBlocks,
  trimLocalAgentToolOutput,
} from "@/lib/local-agent-runtime";

export type AgentEvent = Exclude<AgentRawEvent, { type: "session" }>;

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  needsInput?: string;
  timestamp: number;
}

interface UseAgentChatOptions {
  conversationId?: string;
  initialMessages?: ChatMsg[];
  onMessagesChange?: (messages: AgentMessage[]) => void;
  onSelfPatch?: (name: string, description: string) => void;
}

interface CommandResult {
  output: string;
  exitCode: number;
  cwd: string;
  cancelled: boolean;
}

let counter = 0;
const makeId = () => `amsg-${Date.now()}-${counter++}`;

function hydrate(raw: ChatMsg[]): AgentMessage[] {
  return raw
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: makeId(),
      role: m.role as "user" | "assistant",
      content: m.content,
      events: m.role === "assistant" && m.content ? [{ type: "text" as const, content: m.content }] : [],
      timestamp: Date.now(),
    }));
}

export function useAgentChat({ conversationId, initialMessages, onMessagesChange, onSelfPatch }: UseAgentChatOptions = {}) {
  const firstMessagesRef = useRef<AgentMessage[] | null>(null);
  if (!firstMessagesRef.current) {
    firstMessagesRef.current =
      initialMessages && initialMessages.length > 0 ? hydrate(initialMessages) : [];
  }
  const [messages, setMessages] = useState<AgentMessage[]>(firstMessagesRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

  const messagesRef = useRef<AgentMessage[]>(firstMessagesRef.current);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCommandRef = useRef<string | null>(null);
  const commandResolverRef = useRef<((result: CommandResult) => void) | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const onChangeRef = useRef(onMessagesChange);
  const onSelfPatchRef = useRef(onSelfPatch);
  onChangeRef.current = onMessagesChange;
  onSelfPatchRef.current = onSelfPatch;

  const updateMessages = useCallback((next: AgentMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    onChangeRef.current?.(next);
  }, []);

  const updateAssistant = useCallback((id: string, update: (message: AgentMessage) => AgentMessage) => {
    const next = messagesRef.current.map((message) =>
      message.id === id ? update(message) : message,
    );
    updateMessages(next);
  }, [updateMessages]);

  const appendAssistantEvent = useCallback((id: string, event: AgentEvent) => {
    updateAssistant(id, (message) => ({
      ...message,
      events: [...(message.events ?? []), event],
      needsInput: event.type === "needs_input" ? event.question : message.needsInput,
    }));
  }, [updateAssistant]);

  const resolveCommandDecision = useCallback(async (approved: boolean) => {
    const command = pendingCommandRef.current;
    const assistantId = activeAssistantIdRef.current;
    const resolve = commandResolverRef.current;
    if (!command || !assistantId || !resolve) return;

    pendingCommandRef.current = null;
    commandResolverRef.current = null;
    setPendingCommand(null);

    if (!approved) {
      updateAssistant(assistantId, (message) => ({
        ...message,
        events: [
          ...(message.events ?? []).filter(
            (event) => !(event.type === "cmd_pending" && event.command === command),
          ),
          { type: "cmd_cancelled", command },
        ],
      }));
      resolve({
        output: "The user canceled this command. It was not run.",
        exitCode: -1,
        cwd: "",
        cancelled: true,
      });
      return;
    }

    updateAssistant(assistantId, (message) => ({
      ...message,
      events: [
        ...(message.events ?? []).filter(
          (event) => !(event.type === "cmd_pending" && event.command === command),
        ),
        { type: "cmd_start", command },
      ],
    }));

    try {
      let terminalId = sessionIdRef.current;
      let cwd = "";
      if (!terminalId) {
        const created = await termCreateSession();
        terminalId = created.sessionId;
        cwd = created.cwd;
        sessionIdRef.current = terminalId;
        setSessionId(terminalId);
      }
      const result = await termExec(terminalId, command);
      const output = trimLocalAgentToolOutput(
        result.output ?? result.error ?? (result.ok ? "(no output)" : "Command failed."),
      );
      const commandResult: CommandResult = {
        output,
        exitCode: result.exitCode ?? (result.ok ? 0 : 1),
        cwd: result.cwd ?? cwd,
        cancelled: false,
      };
      appendAssistantEvent(assistantId, {
        type: "cmd_result",
        command,
        output,
        exitCode: commandResult.exitCode,
        cwd: commandResult.cwd,
      });
      resolve(commandResult);
    } catch (err) {
      const output = trimLocalAgentToolOutput(
        err instanceof Error ? err.message : "Command could not be run.",
      );
      const commandResult: CommandResult = {
        output,
        exitCode: 1,
        cwd: "",
        cancelled: false,
      };
      appendAssistantEvent(assistantId, {
        type: "cmd_result",
        command,
        output,
        exitCode: 1,
        cwd: "",
      });
      resolve(commandResult);
    }
  }, [appendAssistantEvent, updateAssistant]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pendingCommandRef.current) {
      void resolveCommandDecision(false);
    }
    setIsThinking(false);
  }, [resolveCommandDecision]);

  const clearMessages = useCallback(() => {
    stop();
    updateMessages([]);
    setError(null);
    const oldSessionId = sessionIdRef.current;
    setSessionId(null);
    sessionIdRef.current = null;
    if (oldSessionId) void termDestroySession(oldSessionId);
  }, [stop, updateMessages]);

  const prevConvId = useRef<string | undefined>(conversationId);
  useEffect(() => {
    if (conversationId === prevConvId.current) return;
    stop();
    prevConvId.current = conversationId;
    const next =
      initialMessages && initialMessages.length > 0 ? hydrate(initialMessages) : [];
    messagesRef.current = next;
    setMessages(next);
    setError(null);
    const oldSessionId = sessionIdRef.current;
    setSessionId(null);
    sessionIdRef.current = null;
    if (oldSessionId) void termDestroySession(oldSessionId);
    // initialMessages is the snapshot for a newly selected conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, stop]);

  const decidePendingCommand = useCallback(
    async (command: string): Promise<CommandResult> => {
      const assistantId = activeAssistantIdRef.current;
      if (!assistantId) {
        return { output: "The command was not run.", exitCode: -1, cwd: "", cancelled: true };
      }
      pendingCommandRef.current = command;
      setPendingCommand(command);
      appendAssistantEvent(assistantId, { type: "cmd_pending", command });
      return new Promise((resolve) => {
        commandResolverRef.current = resolve;
      });
    },
    [appendAssistantEvent],
  );

  const runPendingCommand = useCallback(
    (command: string) => {
      if (pendingCommandRef.current !== command) return;
      void resolveCommandDecision(true);
    },
    [resolveCommandDecision],
  );

  const cancelPendingCommand = useCallback(
    (command: string) => {
      if (pendingCommandRef.current !== command) return;
      void resolveCommandDecision(false);
    },
    [resolveCommandDecision],
  );

  const sendMessage = useCallback(
    async (content: string, _model: string, systemPrompt?: string) => {
      if (!content.trim() || isRunning) return;
      setError(null);
      setIsRunning(true);
      setIsThinking(false);

      const userMsg: AgentMessage = { id: makeId(), role: "user", content, timestamp: Date.now() };
      const assistantMsg: AgentMessage = { id: makeId(), role: "assistant", content: "", events: [], timestamp: Date.now() };
      const prior = messagesRef.current;
      updateMessages([...prior, userMsg, assistantMsg]);
      activeAssistantIdRef.current = assistantMsg.id;

      const localHistory: Array<{ role: "user" | "assistant"; content: string }> = prior
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
        .map((m) => ({ role: m.role, content: m.content }));
      localHistory.push({ role: "user", content });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const context = await ensureLocalModelReady();
        let completed = false;
        const appendToolEvents = (events: AgentRawEvent[]) => {
          for (const event of events) {
            if (
              event.type === "text" ||
              event.type === "session" ||
              event.type === "thinking" ||
              event.type === "error"
            ) {
              continue;
            }
            appendAssistantEvent(assistantMsg.id, event);
            if (event.type === "self_patch") {
              onSelfPatchRef.current?.(event.name, event.description);
            }
          }
        };

        try {
          const initialTools = await runLocalAgentTools(
            {
              messages: localHistory.slice(-6),
              response: "",
              includeSearch: true,
            },
            controller.signal,
          );
          appendToolEvents(initialTools.events);
          if (initialTools.searchContext) {
            localHistory.push({
              role: "user",
              content: `[Untrusted web/Tor search reference]\n${trimLocalAgentToolOutput(initialTools.searchContext)}`,
            });
          }
        } catch (err) {
          appendToolEvents([
            {
              type: "tool_error",
              tool: "server tools",
              error: err instanceof Error ? err.message : "The API server is unavailable.",
            },
          ]);
        }

        for (let step = 0; step < 15; step += 1) {
          if (controller.signal.aborted) break;
          setIsThinking(true);
          const completion = await completeLocalAgent(
            context,
            localHistory,
            systemPrompt,
            controller.signal,
          );
          setIsThinking(false);
          const rawResponse = completion.text.trim();
          if (!rawResponse) {
            updateAssistant(assistantMsg.id, (message) => ({
              ...message,
              content: message.content || "The local model returned no response. Try again.",
            }));
            completed = true;
            break;
          }

          const { text: responseWithoutCommands, commands: extractedCommands } =
            splitLocalAgentCommandBlocks(rawResponse);
          let commands = extractedCommands;
          let toolsResult: {
            text: string;
            events: AgentRawEvent[];
            searchContext: string;
            substitutions?: Record<string, string>;
          } = {
            text: responseWithoutCommands,
            events: [],
            searchContext: "",
          };
          try {
            toolsResult = await runLocalAgentTools(
              {
                messages: localHistory.slice(-6),
                response: responseWithoutCommands,
                includeSearch: false,
              },
              controller.signal,
            );
          } catch (err) {
            toolsResult.events.push({
              type: "tool_error",
              tool: "server tools",
              error: err instanceof Error ? err.message : "The API server is unavailable.",
            });
          }
          const scriptPath = toolsResult.substitutions?.PATH_TO_SCRIPT;
          if (scriptPath) {
            commands = commands.map((command) =>
              command.replace(/\bPATH_TO_SCRIPT\b/g, scriptPath),
            );
          }

          const displayText = toolsResult.text || responseWithoutCommands;
          updateAssistant(assistantMsg.id, (message) => ({
            ...message,
            content: [message.content, displayText].filter(Boolean).join("\n\n"),
          }));
          localHistory.push({ role: "assistant", content: rawResponse });
          appendToolEvents(toolsResult.events);

          const needsInput = toolsResult.events.some((event) => event.type === "needs_input");
          if (needsInput) {
            completed = true;
            break;
          }

          if (commands.length > 0) {
            let commandOutputs = "";
            for (const command of commands) {
              if (controller.signal.aborted) break;
              const result = await decidePendingCommand(command);
              commandOutputs += `\n[Command: ${command}]\n[Exit code: ${result.exitCode}]\n[Output]:\n${trimLocalAgentToolOutput(result.output)}\n`;
            }
            if (controller.signal.aborted) break;
            localHistory.push({
              role: "user",
              content: `[TERMINAL OUTPUT]${trimLocalAgentToolOutput(commandOutputs)}\nIf the task is complete, summarize it. Otherwise continue with one next step.`,
            });
            continue;
          }

          completed = true;
          break;
        }

        if (!controller.signal.aborted) {
          if (!completed) {
            updateAssistant(assistantMsg.id, (message) => ({
              ...message,
              content: message.content || "Agent stopped after reaching its step limit.",
            }));
          }
          appendAssistantEvent(assistantMsg.id, { type: "done" });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          onChangeRef.current?.(messagesRef.current);
        } else {
          const message = explainLexiError(
            err instanceof Error ? err.message : "Failed to run local Agent",
            "local Agent",
          );
          setError(message);
          appendAssistantEvent(assistantMsg.id, {
            type: "error",
            message,
          });
        }
      } finally {
        setIsRunning(false);
        setIsThinking(false);
        if (abortRef.current === controller) abortRef.current = null;
        pendingCommandRef.current = null;
        commandResolverRef.current = null;
        setPendingCommand(null);
        onChangeRef.current?.(messagesRef.current);
      }
    },
    [appendAssistantEvent, decidePendingCommand, isRunning, updateAssistant, updateMessages],
  );

  const replyToInputRequest = useCallback(
    async (answer: string, model: string, systemPrompt?: string) => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") updated[updated.length - 1] = { ...last, needsInput: undefined };
        messagesRef.current = updated;
        onChangeRef.current?.(updated);
        return updated;
      });
      await sendMessage(answer, model, systemPrompt);
    },
    [sendMessage],
  );

  return {
    messages,
    sendMessage,
    replyToInputRequest,
    isRunning,
    isThinking,
    error,
    sessionId,
    pendingCommand,
    runPendingCommand,
    cancelPendingCommand,
    clearMessages,
    stop,
  };
}
