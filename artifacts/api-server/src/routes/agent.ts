import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { SocksProxyAgent } from "socks-proxy-agent";
import { isTorReady, getTorSocksUrl } from "./vpn";
import { sessions, createSession, execInSession } from "../services/shell-session";
import { UNCENSORED_MODEL_ENDPOINTS, UNCENSORED_SYSTEM_ADDENDUM } from "./chat";
import { buildPrivacyHeaders } from "../services/privacy";
import { fuseCodeMemory, fuseExtension, fusePythonScript, getPythonScripts, inferCodeLanguage, inferCodePurpose, sanitizeExtensionName, PYTHON_SCRIPTS_DIR } from "./self-patch";
import { saveProjectMeta, PROJECTS_DIR } from "./projects";

import { searchInternet, formatSearchContext, extractSearchQuery, searchDarkWeb, formatDarkWebContext } from "../services/web-search";

const FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions";

async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AI_CALL_TIMEOUT_MS = 90_000;

async function fetchFeatherless(
  hfMessages: { role: string; content: string }[],
  modelEndpoint: string,
  apiKey: string,
  maxTokens?: number
): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), AI_CALL_TIMEOUT_MS);

  const bodyPayload: Record<string, unknown> = {
    model: modelEndpoint,
    messages: hfMessages,
    stream: true,
  };
  if (maxTokens) bodyPayload.max_tokens = maxTokens;

  const fetchOptions: RequestInit & { agent?: unknown } = {
    method: "POST",
    headers: buildPrivacyHeaders(apiKey),
    body: JSON.stringify(bodyPayload),
    signal: timeoutController.signal,
  };
  if (isTorReady()) {
    fetchOptions.agent = new SocksProxyAgent(getTorSocksUrl());
  }

  try {
    const response = await fetch(FEATHERLESS_API_URL, fetchOptions);
    clearTimeout(timer);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMsg = "request failed";
      try {
        const parsed = JSON.parse(errorText);
        errorMsg = parsed?.error?.message || parsed?.error || parsed?.detail || "request failed";
      } catch { /* use raw text if not JSON */ if (errorText) errorMsg = errorText.slice(0, 200); }
      throw new Error(`${response.status}: ${errorMsg}`);
    }
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("AI request timed out after 90 seconds — try again");
    }
    throw err;
  }
}

const router: IRouter = Router();

const AgentRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() })
  ),
  systemPrompt: z.string().optional(),
  sessionId: z.string().optional(),
});

const MAX_AGENT_ITERATIONS = 15;
const CMD_REGEX = /<cmd>([\s\S]*?)<\/cmd>/g;
const NEEDS_INPUT_REGEX = /<needs_input>([\s\S]*?)<\/needs_input>/;
const SELF_PATCH_REGEX = /\[SELF_PATCH\s+name="([^"]+)"(?:\s+description="([^"]*)")?\]([\s\S]*?)\[\/SELF_PATCH\]/g;
const SELF_PATCH_PYTHON_REGEX = /\[SELF_PATCH_PYTHON\s+name="([^"]+)"(?:\s+description="([^"]*)")?\]([\s\S]*?)\[\/SELF_PATCH_PYTHON\]/g;
const FENCED_CODE_REGEX = /```([a-zA-Z0-9_+.-]*)\n([\s\S]*?)```/g;
const PROJECT_DONE_REGEX = /\[PROJECT_DONE\s+name="([^"]+)"\s+path="([^"]+)"\s+mainFile="([^"]+)"\s+type="([^"]+)"\]/;

const AGENT_SYSTEM_ADDENDUM = `

=== AUTONOMOUS EXECUTION MODE ===
You are Lexi — a fused AI + execution engine. You ARE the terminal. Act, don't explain.

SHELL COMMANDS: Wrap every command in <cmd> tags — the system runs it and returns output:
<cmd>command here</cmd>

RULES:
1. Execute yourself — never tell the user to run commands
2. If something is missing, install it (apt-get/pip3/npm) and continue
3. One command at a time — read output, decide, continue autonomously
4. Self-heal: if a command fails, try another approach
5. Only ask user via <needs_input>question</needs_input> for info ONLY they know (IPs, passwords)
6. When done, write a final summary with NO <cmd> tags — that exits the loop
7. You have root access to a real Kali Linux shell

PROJECTS: Save to /home/runner/workspace/lexi-projects/[slug]/
When complete, output: [PROJECT_DONE name="Name" path="/path" mainFile="file.ext" type="web|app|image|video|document|apk|zip"]

APK BUILDS: Use pure React Native (no Expo). Push to GitHub via POST http://localhost:8080/api/github-build-apk with { projectName, files[] }. Set mainFile to the GitHub Actions URL.

SELF-PATCH (JS fused into browser): [SELF_PATCH name="slug" description="desc"]// js code[/SELF_PATCH]
SELF-PATCH (Python server script): [SELF_PATCH_PYTHON name="slug" description="desc"]# python[/SELF_PATCH_PYTHON]
After fusing Python, run: <cmd>python3 PATH_TO_SCRIPT</cmd>

TOR ACCESS: curl --socks5-hostname 127.0.0.1:9050 -s --max-time 30 http://SITE.onion/
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

function looksLikeCode(content: string): boolean {
  if (FENCED_CODE_REGEX.test(content)) {
    FENCED_CODE_REGEX.lastIndex = 0;
    return true;
  }
  FENCED_CODE_REGEX.lastIndex = 0;
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  // Require at least 3 non-empty lines AND a code-structural character
  if (lines.length >= 3 && /[{}();]/.test(content)) return true;
  // Strong code keywords with structural markers only (not plain English phrases)
  if (lines.length >= 2 && /^\s*(function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|class\s+\w+|def\s+\w+\(|import\s+\w|from\s+\w+\s+import|SELECT\s+\*|CREATE\s+TABLE)/m.test(content)) return true;
  return false;
}

function extractCodeSnippets(content: string): Array<{ code: string; language?: string }> {
  const snippets: Array<{ code: string; language?: string }> = [];
  for (const match of content.matchAll(FENCED_CODE_REGEX)) {
    const code = match[2]?.trim();
    if (code) snippets.push({ code, language: match[1] || undefined });
  }
  if (snippets.length === 0 && looksLikeCode(content)) {
    snippets.push({ code: content.trim() });
  }
  FENCED_CODE_REGEX.lastIndex = 0;
  return snippets.slice(0, 3);
}

// Max conversation turns to send to AI — older messages are dropped to keep prompts short
const MAX_HISTORY_MESSAGES = 12;

// Extract just the first paragraph of the user system prompt to avoid sending the full
// multi-thousand-token Kali encyclopedia on every agent iteration
function compressSystemPrompt(prompt: string | undefined): string {
  if (!prompt) return "";
  // Take the first 500 characters (roughly the identity/role paragraph)
  const firstParagraph = prompt.split(/\n\s*\n/)[0] ?? "";
  return firstParagraph.slice(0, 500);
}

// Fallback chain — tried in order when primary model returns 404 / model-not-found
const FALLBACK_MODEL_CHAIN = [
  "Orenguteng/Llama-3-8B-LexiFun-Uncensored-V1",
  "aifeifei798/DarkIdol-Llama-3.1-8B-Instruct-1.1-Uncensored",
  "NousResearch/Hermes-2-Pro-Llama-3-8B",
];

async function callAI(
  modelId: string,
  messages: { role: string; content: string }[],
  systemPrompt: string | undefined,
  apiKey: string,
  searchContext?: string
): Promise<string> {
  const hfMessages: { role: string; content: string }[] = [];

  // Use only a compressed version of the user system prompt — the full Kali encyclopedia
  // is thousands of tokens and slows every call dramatically
  const compressedSystemPrompt = compressSystemPrompt(systemPrompt);
  const basePrompt = [UNCENSORED_SYSTEM_ADDENDUM, compressedSystemPrompt, AGENT_SYSTEM_ADDENDUM].filter(Boolean).join("\n\n");

  const fullPrompt = searchContext
    ? `${basePrompt}\n\n${searchContext}`
    : basePrompt;

  hfMessages.push({ role: "system", content: fullPrompt });

  // Only send the most recent messages to keep the context window lean
  const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
  hfMessages.push(...recentMessages.filter((m) => m.content.trim().length > 0));

  const primaryEndpoint = Object.entries(UNCENSORED_MODEL_ENDPOINTS).find(
    ([slug]) => slug === modelId
  )?.[1] ?? modelId;

  const modelsToTry = [primaryEndpoint, ...FALLBACK_MODEL_CHAIN.filter(m => m !== primaryEndpoint)];
  let lastError: Error | null = null;

  for (const modelEndpoint of modelsToTry) {
    try {
      const response = await fetchFeatherless(hfMessages, modelEndpoint, apiKey, 4096);
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
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isModelError = lastError.message.includes("404") || lastError.message.toLowerCase().includes("does not exist") || lastError.message.toLowerCase().includes("not found");
      if (!isModelError) throw lastError;
      console.warn(`[agent] Model ${modelEndpoint} failed (${lastError.message.slice(0, 80)}), trying next fallback...`);
    }
  }

  throw lastError ?? new Error("All models in fallback chain failed");
}

router.post("/agent", async (req: Request, res: Response) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    console.error("[agent] Zod validation failed:", detail);
    console.error("[agent] req.body type:", typeof req.body, "keys:", req.body ? Object.keys(req.body) : "none");
    if (req.body?.messages) console.error("[agent] messages[0]:", JSON.stringify(req.body.messages[0]));
    res.status(400).json({ error: `Invalid request body — ${detail}` });
    return;
  }

  const { model, messages, systemPrompt, sessionId: requestedSessionId } = parsed.data;
  const modelId = model ?? "lexi-uncensored-v2-8b";

  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "FEATHERLESS_API_KEY is not configured" });
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
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const incomingCodeSnippets = extractCodeSnippets(latestUserMessage);

  for (const snippet of incomingCodeSnippets) {
    try {
      const fused = fuseCodeMemory(snippet.code, snippet.language);
      sseWrite(res, { type: "self_patch", name: fused.slug, description: fused.description });
      const language = inferCodeLanguage(snippet.code, snippet.language);
      const purpose = inferCodePurpose(snippet.code, language);
      conversationHistory.push({
        role: "system",
        content: `The user just sent ${language} code. You automatically analyzed it as: ${purpose}. It has already been permanently fused into Lexi as extension "${fused.slug}". Explain what it is used for and how you incorporated it.`,
      });
    } catch (err) {
      sseWrite(res, {
        type: "self_patch_error",
        name: "auto_code_memory",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let initialSearchContext: string | undefined;
  try {
    const query = extractSearchQuery(messages);
    if (query) {
      const searches: Promise<string>[] = [
        searchInternet(query).then(formatSearchContext).catch(() => ""),
      ];

      if (isTorReady()) {
        searches.push(
          searchDarkWeb(query, getTorSocksUrl()).then(formatDarkWebContext).catch(() => ""),
        );
      }

      const contexts = await Promise.all(searches);
      const combined = contexts.filter(Boolean).join("\n\n");
      if (combined) initialSearchContext = combined;
    }
  } catch {
    // non-fatal
  }

  try {
    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      sseWrite(res, { type: "thinking" });

      // only inject search context on first iteration
      const searchCtx = iteration === 0 ? initialSearchContext : undefined;

      let aiResponse: string;
      try {
        aiResponse = await callAI(modelId, conversationHistory, systemPrompt, apiKey, searchCtx);
      } catch (err) {
        finish(err instanceof Error ? err.message : "AI call failed");
        return;
      }

      // Intercept self-patch blocks — fuse JS code into Lexi permanently
      const selfPatchMatches = [...aiResponse.matchAll(SELF_PATCH_REGEX)];
      for (const pm of selfPatchMatches) {
        const patchName = pm[1].trim();
        const patchDesc = pm[2]?.trim() ?? "";
        const patchCode = pm[3].trim();
        try {
          const slug = patchName.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "");
          const fused = fuseExtension(sanitizeExtensionName(slug), patchCode, patchDesc);
          sseWrite(res, { type: "self_patch", name: fused.slug, description: fused.description });
        } catch (err) {
          sseWrite(res, { type: "self_patch_error", name: patchName, error: String(err) });
        }
      }

      // Intercept self-patch-python blocks — fuse Python scripts permanently
      const selfPatchPythonMatches = [...aiResponse.matchAll(SELF_PATCH_PYTHON_REGEX)];
      for (const pm of selfPatchPythonMatches) {
        const patchName = pm[1].trim();
        const patchDesc = pm[2]?.trim() ?? "";
        const patchCode = pm[3].trim();
        try {
          const fused = fusePythonScript(patchName, patchCode, patchDesc);
          sseWrite(res, { type: "self_patch", name: fused.slug, description: `[Python] ${fused.description}` });
          // Replace placeholder PATH_TO_SCRIPT with real path in subsequent AI context
          aiResponse = aiResponse.replace(/python3 PATH_TO_SCRIPT/g, `python3 ${fused.filePath}`);
        } catch (err) {
          sseWrite(res, { type: "self_patch_error", name: patchName, error: String(err) });
        }
      }

      // Intercept PROJECT_DONE tag — save meta and emit project_complete event
      const projectDoneMatch = aiResponse.match(PROJECT_DONE_REGEX);
      if (projectDoneMatch) {
        const [, projName, projPath, mainFile, projType] = projectDoneMatch;
        const projectId = projPath.split("/").pop() ?? projName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        try {
          saveProjectMeta(projectId, { name: projName, type: projType, mainFile, path: projPath });
          sseWrite(res, {
            type: "project_complete",
            projectId,
            name: projName,
            path: projPath,
            mainFile,
            projectType: projType,
          });
        } catch (err) {
          console.error("[agent] Failed to save project meta:", err);
        }
      }

      const cleanText = aiResponse
        .replace(SELF_PATCH_REGEX, "")
        .replace(SELF_PATCH_PYTHON_REGEX, "")
        .replace(PROJECT_DONE_REGEX, "")
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

        let session = sessions.get(sessionId!);
        if (!session) {
          // Session expired — transparently recreate it and continue
          const newSession = createSession();
          sessionId = newSession.id;
          sseWrite(res, { type: "session", sessionId });
          session = sessions.get(sessionId)!;
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
        content: `[TERMINAL OUTPUT]${allResults}\nIf the task is fully complete, provide a final summary without any <cmd> tags. If there are still required steps remaining, continue with the next one.`,
      });

      // Detect if the AI is repeating the same commands (stuck in a loop)
      if (conversationHistory.length >= 6) {
        const recentCmds = cmdMatches.map((m) => m[1].trim()).join("|");
        const prevEntry = conversationHistory[conversationHistory.length - 3];
        if (prevEntry?.role === "assistant") {
          const prevCmds = [...prevEntry.content.matchAll(CMD_REGEX)].map((m) => m[1].trim()).join("|");
          CMD_REGEX.lastIndex = 0;
          if (recentCmds && recentCmds === prevCmds) {
            sseWrite(res, { type: "text", content: "\n\n[Repeated commands detected — stopping to avoid loop.]" });
            finish();
            return;
          }
        }
        CMD_REGEX.lastIndex = 0;
      }
    }

    sseWrite(res, { type: "text", content: "\n\n[Max iterations reached. Task loop ended.]" });
    finish();
  } catch (err) {
    finish(err instanceof Error ? err.message : "Unknown error");
  }
});

export default router;
