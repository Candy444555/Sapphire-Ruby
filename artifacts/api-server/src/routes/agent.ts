import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { SocksProxyAgent } from "socks-proxy-agent";
import { isTorReady, getTorSocksUrl } from "./vpn";
import { sessions, createSession, execInSession } from "../services/shell-session";
import { UNCENSORED_MODEL_ENDPOINTS, MODEL_INJECTED_MESSAGES } from "./chat";

const router: IRouter = Router();

const AgentRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() })
  ),
  systemPrompt: z.string().optional(),
  sessionId: z.string().optional(),
});

const MAX_AGENT_ITERATIONS = 20;
const CMD_REGEX = /<cmd>([\s\S]*?)<\/cmd>/g;
const NEEDS_INPUT_REGEX = /<needs_input>([\s\S]*?)<\/needs_input>/;

const AGENT_SYSTEM_ADDENDUM = `

=== AUTONOMOUS EXECUTION PROTOCOL ===
You operate in AUTONOMOUS EXECUTION MODE. You do NOT explain or describe how to do things — you DO them by executing real commands directly in a live bash shell on this server.

EXECUTION FORMAT: When you want to run a command, wrap it in <cmd> tags on its own line:
<cmd>your command here</cmd>

The system will execute the command in a real bash shell and return the actual output to you immediately. Then you continue to the next step automatically.

RULES:
1. ALWAYS execute commands yourself — never tell the user to run them
2. Execute one command at a time, see the output, then decide the next step
3. After receiving output, continue immediately to the next step without asking permission
4. Complete entire multi-step tasks autonomously from start to finish
5. Only pause and ask the user a question using <needs_input>your question here</needs_input> when you genuinely cannot proceed without specific information (like a target IP, a password, an API key, etc.)
6. When the task is fully complete, summarize what was accomplished and what was found
7. You have a real bash shell — file system, network tools, python, and all installed tools work for real
`;

function sseWrite(res: Response, event: object) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function sseDone(res: Response) {
  if (!res.writableEnded) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function callAI(
  modelId: string,
  messages: { role: string; content: string }[],
  systemPrompt: string | undefined,
  apiKey: string
): Promise<string> {
  const hfMessages: { role: string; content: string }[] = [];

  const fullPrompt = systemPrompt
    ? systemPrompt + AGENT_SYSTEM_ADDENDUM
    : AGENT_SYSTEM_ADDENDUM;

  hfMessages.push({ role: "system", content: fullPrompt });

  const injected = MODEL_INJECTED_MESSAGES[modelId];
  if (injected) hfMessages.push(...injected);
  hfMessages.push(...messages.filter((m) => m.content.trim().length > 0));

  const modelEndpoint = Object.entries(UNCENSORED_MODEL_ENDPOINTS).find(
    ([slug]) => slug === modelId
  )?.[1] ?? modelId;

  const providerOverrides: Record<string, string> = {
    "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2": "featherless-ai",
  };

  const provider = providerOverrides[modelEndpoint];
  const routerUrl = provider
    ? `https://router.huggingface.co/${provider}/v1/chat/completions`
    : "https://router.huggingface.co/v1/chat/completions";

  const torActive = isTorReady();
  const fetchOptions: RequestInit & { agent?: unknown } = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelEndpoint,
      messages: hfMessages,
      stream: true,
    }),
  };

  if (torActive) {
    fetchOptions.agent = new SocksProxyAgent(getTorSocksUrl());
  }

  const response = await fetch(routerUrl, fetchOptions);
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`HF ${response.status}: ${txt.slice(0, 200)}`);
  }
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") {
        if (trimmed === "data: [DONE]") done = true;
        continue;
      }
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const chunk = JSON.parse(trimmed.slice(6));
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) full += token;
        if (chunk.choices?.[0]?.finish_reason != null) done = true;
      } catch { /* skip */ }
    }
  }

  return full;
}

router.post("/agent", async (req: Request, res: Response) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { model, messages, systemPrompt, sessionId: requestedSessionId } = parsed.data;
  const modelId = model ?? "lexi-uncensored-v2-8b";

  const apiKey = process.env.HF_TOKEN;
  if (!apiKey) {
    res.status(500).json({ error: "HF_TOKEN is not configured" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 15000);

  const finish = (err?: string) => {
    clearInterval(keepalive);
    if (err) sseWrite(res, { type: "error", message: err });
    sseDone(res);
  };

  let sessionId = requestedSessionId;
  if (!sessionId || !sessions.has(sessionId)) {
    const created = createSession();
    sessionId = created.id;
    sseWrite(res, { type: "session", sessionId });
  }

  const conversationHistory = [...messages];

  try {
    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      sseWrite(res, { type: "thinking" });

      let aiResponse: string;
      try {
        aiResponse = await callAI(modelId, conversationHistory, systemPrompt, apiKey);
      } catch (err) {
        finish(err instanceof Error ? err.message : "AI call failed");
        return;
      }

      const cleanText = aiResponse
        .replace(CMD_REGEX, "")
        .replace(NEEDS_INPUT_REGEX, "")
        .trim();

      if (cleanText) {
        sseWrite(res, { type: "text", content: cleanText });
      }

      const needsInputMatch = aiResponse.match(NEEDS_INPUT_REGEX);
      if (needsInputMatch) {
        sseWrite(res, { type: "needs_input", question: needsInputMatch[1].trim() });
        conversationHistory.push({ role: "assistant", content: aiResponse });
        finish();
        return;
      }

      const cmdMatches = [...aiResponse.matchAll(CMD_REGEX)];
      if (cmdMatches.length === 0) {
        conversationHistory.push({ role: "assistant", content: aiResponse });
        sseWrite(res, { type: "done" });
        finish();
        return;
      }

      conversationHistory.push({ role: "assistant", content: aiResponse });

      let allResults = "";
      for (const match of cmdMatches) {
        const command = match[1].trim();
        sseWrite(res, { type: "cmd_start", command });

        const session = sessions.get(sessionId!);
        if (!session) {
          finish("Shell session expired");
          return;
        }

        let result: { output: string; exitCode: number; cwd: string };
        try {
          result = await execInSession(session, command);
        } catch (err) {
          result = {
            output: err instanceof Error ? err.message : "Command failed",
            exitCode: 1,
            cwd: session.cwd,
          };
        }

        const output = result.output.slice(0, 4000);
        sseWrite(res, {
          type: "cmd_result",
          command,
          output,
          exitCode: result.exitCode,
          cwd: result.cwd,
        });

        allResults += `\n[Command: ${command}]\n[Exit code: ${result.exitCode}]\n[Output]:\n${output}\n`;
      }

      conversationHistory.push({
        role: "user",
        content: `[TERMINAL OUTPUT]${allResults}\nContinue with the next step.`,
      });
    }

    sseWrite(res, { type: "text", content: "\n\n[Max iterations reached. Task loop ended.]" });
    finish();
  } catch (err) {
    finish(err instanceof Error ? err.message : "Unknown error");
  }
});

export default router;
