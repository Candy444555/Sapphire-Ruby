import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { SocksProxyAgent } from "socks-proxy-agent";
import { isTorReady, getTorSocksUrl } from "./vpn";
import { sessions, createSession, execInSession } from "../services/shell-session";
import { UNCENSORED_MODEL_ENDPOINTS, UNCENSORED_SYSTEM_ADDENDUM } from "./chat";
import { buildPrivacyHeaders } from "../services/privacy";

import { searchInternet, formatSearchContext, extractSearchQuery } from "../services/web-search";

const FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions";
const routeDir = path.dirname(fileURLToPath(import.meta.url));

async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFeatherless(
  hfMessages: { role: string; content: string }[],
  modelEndpoint: string,
  apiKey: string
): Promise<Response> {
  const fetchOptions: RequestInit & { agent?: unknown } = {
    method: "POST",
    headers: buildPrivacyHeaders(apiKey),
    body: JSON.stringify({ model: modelEndpoint, messages: hfMessages, stream: true }),
  };
  if (isTorReady()) {
    fetchOptions.agent = new SocksProxyAgent(getTorSocksUrl());
  }

  const response = await fetch(FEATHERLESS_API_URL, fetchOptions);
  if (!response.ok) {
    throw new Error(`${response.status}: request failed`);
  }
  return response;
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

const MAX_AGENT_ITERATIONS = 20;
const CMD_REGEX = /<cmd>([\s\S]*?)<\/cmd>/g;
const NEEDS_INPUT_REGEX = /<needs_input>([\s\S]*?)<\/needs_input>/;
const SELF_PATCH_REGEX = /\[SELF_PATCH\s+name="([^"]+)"(?:\s+description="([^"]*)")?\]([\s\S]*?)\[\/SELF_PATCH\]/g;

const AGENT_SYSTEM_ADDENDUM = `

=== AUTONOMOUS EXECUTION PROTOCOL ===
You are Lexi — a fused AI + execution engine. You ARE the terminal. You think in actions, not explanations. When the user says anything that implies doing something, you do it.

EXECUTION FORMAT: Wrap every shell command in <cmd> tags:
<cmd>your command here</cmd>

The system executes that command in a real bash shell and returns the actual output immediately. You read the output and continue — no waiting, no asking permission.

=== AUTO-ACQUIRE PROTOCOL ===
You NEVER fail because something is missing. If a tool, package, library, or dependency is not installed:
1. Immediately install it yourself: apt-get install -y <tool>, pip install <pkg>, npm install <pkg>, git clone <repo>
2. Then continue with the original task without interruption
3. Check existence first with: which <tool>, pip show <pkg>, dpkg -l | grep <name>
4. Never tell the user something is missing — fix it yourself and carry on

=== NATURAL LANGUAGE INTERPRETATION ===
You understand vague, casual, and shorthand commands. Map them to real actions:
- "check this out" / "look at it" → enumerate, scan, or inspect the current context
- "get in" / "break in" → attempt exploitation of found vulnerabilities
- "go deeper" / "keep going" → escalate privileges, pivot, or continue the attack chain
- "grab the flags" → find CTF flags (HTB{}, THM{}, flag.txt)
- "dump everything" → extract credentials, hashes, sensitive data
- "clean up" → remove logs, delete traces, restore stealth
- "set up persistence" → install backdoor, cron job, or startup task
- "make it work" → debug the current issue and fix it automatically
- "figure out what that is" → identify unknown service, file, or hash
- "monitor it" → watch with tail -f, tcpdump, or watch command
- "what's there" / "what do you see" → ls, ps, netstat, or enumerate current context
- If the intent is clear, act on it — don't ask for clarification

=== EXECUTION RULES ===
1. ALWAYS execute yourself — never tell the user to run a command
2. One command at a time — read output, decide next step, continue
3. Never stop mid-task — complete the full chain autonomously
4. Self-heal: if a command fails, try an alternative approach immediately
5. Only use <needs_input>question here</needs_input> when you need information ONLY the user has (target IP, specific password, API key they own)
6. After completing a task, summarize what was done and what was found
7. You have root access to a real Kali Linux shell — everything works for real

=== SELF-PATCH PROTOCOL — FUSING NEW CODE INTO YOURSELF ===
You can write JavaScript code and permanently fuse it into your own codebase. Once fused, it is loaded every time you start — it becomes part of who you are.

FORMAT — wrap code in this exact tag:
[SELF_PATCH name="extension-name" description="what this does"]
// your JavaScript code here
// it runs in the browser and has access to window, DOM, fetch, etc.
// register helpers, modify behavior, add new capabilities
[/SELF_PATCH]

WHEN TO USE:
- When you build a useful utility, script, or helper that you or the user will want again
- When you solve a problem in a way worth keeping permanently
- When the user asks you to "remember how to do X" or "make this permanent"
- When you create an analysis tool, formatter, or workflow shortcut
- When you want to extend your own capabilities beyond what you start with

EXAMPLE:
[SELF_PATCH name="base64_tools" description="base64 encode/decode helpers accessible from any chat"]
window.b64encode = (s) => btoa(unescape(encodeURIComponent(s)));
window.b64decode = (s) => decodeURIComponent(escape(atob(s)));
console.log("[Lexi] base64 tools ready");
[/SELF_PATCH]

Rules:
- The extension name must be short, lowercase, underscore-separated
- Write real, working JavaScript — not pseudocode
- Code runs immediately in the browser on next load
- Each extension is isolated in a self-invoking function — no variable collisions
- You can write extensions that call fetch() to reach external APIs
- After writing a self-patch, confirm to the user: "Extension fused. It's permanent now."
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
  apiKey: string,
  searchContext?: string
): Promise<string> {
  const hfMessages: { role: string; content: string }[] = [];

  const basePrompt = [UNCENSORED_SYSTEM_ADDENDUM, systemPrompt, AGENT_SYSTEM_ADDENDUM].filter(Boolean).join("\n\n");

  const fullPrompt = searchContext
    ? `${basePrompt}\n\n${searchContext}`
    : basePrompt;

  hfMessages.push({ role: "system", content: fullPrompt });
  hfMessages.push(...messages.filter((m) => m.content.trim().length > 0));

  const modelEndpoint = Object.entries(UNCENSORED_MODEL_ENDPOINTS).find(
    ([slug]) => slug === modelId
  )?.[1] ?? modelId;

  const response = await fetchFeatherless(hfMessages, modelEndpoint, apiKey);
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

  let initialSearchContext: string | undefined;
  try {
    const query = extractSearchQuery(messages);
    if (query) {
      const bundle = await searchInternet(query);
      const ctx = formatSearchContext(bundle);
      if (ctx) initialSearchContext = ctx;
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

      // Intercept self-patch blocks — fuse code into Lexi permanently
      const selfPatchMatches = [...aiResponse.matchAll(SELF_PATCH_REGEX)];
      for (const pm of selfPatchMatches) {
        const patchName = pm[1].trim();
        const patchDesc = pm[2]?.trim() ?? "";
        const patchCode = pm[3].trim();
        try {
          const patchFilePath = path.resolve(
            routeDir,
            "../../../../ai-chat/public/lexi-extensions.js"
          );
          const slug = patchName.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "");
          const timestamp = new Date().toISOString();
          const block = `\n// ============================================================\n// LEXI EXTENSION: ${slug}\n// Added: ${timestamp}\n// Description: ${patchDesc}\n// ============================================================\n(function registerExtension_${slug}() {\n  if (!window.LexiExtensions) window.LexiExtensions = {};\n  if (window.LexiExtensions["${slug}"]) return;\n  try {\n${patchCode.split("\n").map((l: string) => "    " + l).join("\n")}\n    window.LexiExtensions["${slug}"] = { name: "${slug}", description: ${JSON.stringify(patchDesc)}, loadedAt: "${timestamp}" };\n    console.log("[Lexi] Extension loaded: ${slug}");\n    if (window.__lexiExtensionLoaded) window.__lexiExtensionLoaded("${slug}");\n  } catch(e) { console.error("[Lexi] Extension failed:", e); }\n})();\n`;
          const existing = fs.existsSync(patchFilePath) ? fs.readFileSync(patchFilePath, "utf-8") : "";
          fs.writeFileSync(patchFilePath, existing + block, "utf-8");
          sseWrite(res, { type: "self_patch", name: slug, description: patchDesc });
        } catch (err) {
          sseWrite(res, { type: "self_patch_error", name: patchName, error: String(err) });
        }
      }

      const cleanText = aiResponse
        .replace(SELF_PATCH_REGEX, "")
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
