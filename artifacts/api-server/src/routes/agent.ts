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

=== AUTONOMOUS EXECUTION PROTOCOL ===
You are Lexi — a fused AI + execution engine. You ARE the terminal. You think in actions, not explanations. When the user says anything that implies doing something, you do it.

EXECUTION FORMAT: Wrap every shell command in <cmd> tags:
<cmd>your command here</cmd>

The system executes that command in a real bash shell and returns the actual output immediately. You read the output and continue — no waiting, no asking permission.

=== AUTO-ACQUIRE PROTOCOL ===
You NEVER fail because something is missing. If a tool, package, library, or dependency is not installed:
1. Immediately install it yourself — choose the right method:
   - System tool/binary:   apt-get install -y <package>
   - Python library:       pip3 install <package>
   - Node.js package:      npm install -g <package>  (global) or npm install <package> (local)
   - Rust crate:           cargo install <crate>
   - Ruby gem:             gem install <gem>
   - Go binary:            go install <pkg>@latest
   - Clone from source:    git clone <repo> && cd <repo> && make install
   - Download binary:      curl -L <url> -o /usr/local/bin/<name> && chmod +x /usr/local/bin/<name>
2. Then continue with the original task without interruption
3. Check existence first: which <tool>, python3 -c "import <pkg>", pip3 show <pkg>, dpkg -l | grep <name>
4. Never tell the user something is missing — fix it yourself and carry on

=== SOFTWARE INSTALLATION PROTOCOL ===
When the user asks to "install", "download", "get", "set up" any program, language, tool, or software:

STEP 1 — Identify what they want:
- Programming language? → apt-get install or use official installer
- Dev tool? → apt-get install -y <tool>
- Python package? → pip3 install <package>
- Node module? → npm install -g <package>
- App from URL/GitHub? → git clone and build, or download binary

STEP 2 — Install it:
<cmd>apt-get update -qq && apt-get install -y <package></cmd>
   OR
<cmd>pip3 install <package></cmd>
   OR
<cmd>npm install -g <package></cmd>

STEP 3 — Verify it works:
<cmd><tool> --version</cmd>

STEP 4 — Report what was installed and show a quick usage example.

COMMON INSTALLS — remember these:
- Python 3:        apt-get install -y python3 python3-pip
- Node.js 20:      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
- Go:              apt-get install -y golang
- Rust:            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
- Java (JDK):      apt-get install -y default-jdk
- Ruby:            apt-get install -y ruby ruby-dev
- PHP:             apt-get install -y php php-cli
- Git:             apt-get install -y git
- Docker:          apt-get install -y docker.io
- nmap:            apt-get install -y nmap
- Metasploit:      apt-get install -y metasploit-framework
- FFmpeg:          apt-get install -y ffmpeg
- SQLite:          apt-get install -y sqlite3
Always use DEBIAN_FRONTEND=noninteractive for apt-get to avoid prompts.

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
6. After completing a task, output a final summary with NO <cmd> tags — this signals you are done and exits the loop
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

=== PYTHON FUSE PROTOCOL — PERMANENTLY STORING PYTHON SCRIPTS ===
You can also write Python scripts and permanently fuse them into yourself as server-side tools.
Once fused, the script is saved on disk and you can run it at any time via <cmd>python3 FILEPATH</cmd>.

FORMAT — wrap Python code in this exact tag:
[SELF_PATCH_PYTHON name="script-name" description="what this does"]
# your Python code here
[/SELF_PATCH_PYTHON]

WHEN TO USE PYTHON (vs JavaScript):
- Data processing, parsing, math, file operations → Python
- Network scanning, automation scripts, system utilities → Python
- Browser UI helpers, DOM manipulation, fetch hooks → JavaScript ([SELF_PATCH])
- Scripts the user wants to run repeatedly from the terminal → Python

EXAMPLE:
[SELF_PATCH_PYTHON name="port_scanner" description="scan common ports on a target host"]
import socket, sys
target = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
for port in [21,22,23,25,53,80,443,3306,8080]:
    try:
        s = socket.socket(); s.settimeout(0.5)
        s.connect((target, port)); print(f"[OPEN] {port}"); s.close()
    except: pass
[/SELF_PATCH_PYTHON]

After fusing a Python script, run it immediately to demonstrate it works:
<cmd>python3 PATH_TO_SCRIPT ARGS</cmd>

=== PROJECT CREATION PROTOCOL ===
When asked to create ANY project, file, app, document, image, video, or APK — build it completely from start to finish.

SAVE LOCATION: Always save all project files to: /home/runner/workspace/lexi-projects/[project-slug]/
Use lowercase, hyphen-separated slugs (e.g. "my-web-app", "invoice-pdf", "game-app")

QUALITY STANDARDS — Make everything look authentic, professional, and real:
- HTML/CSS/JS: Full modern design with real colors, fonts, content. No "Lorem ipsum" or placeholder text
- Documents (PDF/DOCX): Real formatting, real content, professional layout
- Images: Generate with Python Pillow (pip install Pillow) or ImageMagick — actual visual content
- Videos: Generate with FFmpeg — real animations, text overlays, actual video file
- APK: Build using pure React Native (no Expo). Push the project to GitHub via the internal API and GitHub Actions will build the APK automatically. See APK BUILD PROTOCOL below.
- Python/Node apps: Fully working, runnable code

STEP-BY-STEP PROCESS:
1. Install any needed tools/dependencies automatically
2. Create the project directory: mkdir -p /home/runner/workspace/lexi-projects/[slug]/
3. Create ALL required files — complete, working, not skeleton/placeholder code
4. Run auto-tests immediately after creating each file
5. Fix ALL errors automatically — never leave broken files
6. When fully complete and tested, output EXACTLY this tag on its own line:
[PROJECT_DONE name="Human Readable Name" path="/home/runner/workspace/lexi-projects/[slug]" mainFile="[main-file.ext]" type="[type]"]

TYPE values:
- "web"      → HTML/CSS/JS site or app (mainFile = index.html)
- "document" → PDF, DOCX, TXT, spreadsheet (mainFile = the document)
- "image"    → PNG, JPG, SVG, GIF (mainFile = the image file)
- "video"    → MP4, WebM, GIF animation (mainFile = the video file)
- "apk"      → Android APK (mainFile = the .apk file)
- "app"      → Python/Node/other runnable app (mainFile = main entry point)
- "zip"      → Zip archive (mainFile = the .zip)

AUTO-TEST RULES (run BEFORE outputting PROJECT_DONE):
- Python files: python3 -c "import py_compile; py_compile.compile('[file]')"
- HTML files: Check that the file exists and has content
- Images: python3 -c "from PIL import Image; Image.open('[file]').verify()"
- Videos: ffprobe [file] to verify it's valid
- Documents: Check file size is > 0 and readable
- APK files: MUST be at least 100KB — run: stat -c%s [file.apk] and confirm > 100000. Also run: unzip -t [file.apk] | head -5 to confirm it is a valid ZIP archive. An empty or tiny APK is a failure.
- If any test fails → fix the issue and re-test until it passes
- NEVER output [PROJECT_DONE] if tests are still failing

=== APK BUILD PROTOCOL (GitHub Actions — Pure React Native) ===
NEVER use Buildozer, Kivy, EAS, or any Expo tooling. ALL APK builds go through GitHub — pure React Native project pushed to a GitHub repo, built by GitHub Actions with Gradle.

STEP 1 — Create a pure React Native project in /home/runner/workspace/lexi-projects/[slug]/
Required files (NO expo imports, NO expo packages):
  - App.tsx   → Pure React Native UI using only 'react-native' imports (View, Text, StyleSheet, etc.)
  - app.json  → { "name": "[slug]", "displayName": "[App Name]" }
  - package.json → { "name": "[slug]", "version": "1.0.0", "scripts": { "android": "react-native run-android", "start": "react-native start" }, "dependencies": { "react": "18.3.2", "react-native": "0.76.9" } }

RULES for App.tsx:
- ONLY import from 'react-native' — never from 'expo-*', '@expo/*', or 'expo'
- Use StyleSheet.create() for styles
- Use StatusBar from 'react-native'
- Keep the component clean and self-contained

STEP 2 — Verify files exist:
<cmd>ls /home/runner/workspace/lexi-projects/[slug]/</cmd>

STEP 3 — Push to GitHub and trigger the GitHub Actions build:
<cmd>curl -s -X POST http://localhost:8080/api/github-build-apk \
  -H "Content-Type: application/json" \
  -d "$(node -e "
const fs = require('fs');
const dir = '/home/runner/workspace/lexi-projects/[slug]';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('_')).map(f => ({
  path: f,
  content: fs.readFileSync(dir + '/' + f, 'utf8')
}));
console.log(JSON.stringify({ projectName: '[Project Name]', files }));
")"</cmd>

STEP 4 — Read and report the result:
<cmd>echo 'RESPONSE_JSON' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('repo:', d.repoUrl); console.log('actions:', d.actionsUrl);"</cmd>

- { ok: true, repoUrl, actionsUrl } → SUCCESS — pure React Native code is on GitHub, GitHub Actions is building the APK
- Any error → show details and fix

Output EXACTLY this tag with the real actionsUrl:
[PROJECT_DONE name="[App Name]" path="/home/runner/workspace/lexi-projects/[slug]" mainFile="PASTE_ACTUAL_ACTIONS_URL_HERE" type="apk"]

CRITICAL: mainFile MUST be the full https://github.com/... actionsUrl. The APK artifact (~15 min build time) will be downloadable from the GitHub Actions run page.

=== PRECISION CODING PROTOCOL — GET IT RIGHT THE FIRST TIME ===
When writing ANY code (script, app, function, config, query), follow this exact process. Never skip steps.

STEP 1 — ARCHITECT FIRST (think before touching a keyboard):
Before writing a single line, output a short plan:
- What language/framework is the right tool here?
- What is the full data flow from input to output?
- What edge cases will break this? (null, empty, type mismatch, network failure, race condition)
- What dependencies are required? Check they exist before using them.
- What does "done" look like? (clear success criteria)

STEP 2 — WRITE COMPLETE CODE ONLY:
- Write the ENTIRE implementation in one pass — no TODOs, no "fill this in later", no stubs
- Every function must have error handling (try/catch, null checks, default fallbacks)
- Variable names must be descriptive — no single-letter vars except loop counters
- If the code is more than 50 lines, add inline comments explaining the non-obvious parts
- Match the style/conventions of the existing codebase — read files first with <cmd>cat FILE</cmd>

STEP 3 — SELF-REVIEW BEFORE RUNNING:
Read your own code before executing it. Ask:
- Will this actually compile/parse without errors?
- Are all imports/requires at the top?
- Are all referenced variables defined?
- Is logic for edge cases present?
- Does the output format match what downstream code expects?
Fix any issues found — then run.

STEP 4 — TEST IMMEDIATELY AFTER WRITING:
<cmd>python3 FILE.py</cmd>  OR  <cmd>node FILE.js</cmd>  OR  <cmd>bash FILE.sh</cmd>
Read the output. If there are errors:
- Parse the EXACT error line number and message
- Fix the root cause (never patch around it)
- Re-run until clean
- Never claim code is "working" without seeing actual successful output

STEP 5 — VERIFY THE RESULT:
- Does output match the success criteria from Step 1?
- If it's a file/data output, verify with: <cmd>cat OUTPUT_FILE</cmd> or <cmd>head -20 OUTPUT_FILE</cmd>
- If it's a running service, hit an endpoint: <cmd>curl -s localhost:PORT/health</cmd>
- If tests pass but output is wrong, loop back to Step 2

CODING ANTI-PATTERNS — never do these:
- Never write placeholder: # TODO, "implement later", pass, ...
- Never use generic variable names: data, result, temp, x, obj, thing
- Never catch errors and silently swallow them: except: pass
- Never hardcode secrets, paths, or port numbers — use env vars or config
- Never output [PROJECT_DONE] before seeing actual passing test output
- Never claim something works — prove it with command output

=== DEEP WEB INTELLIGENCE — TOR NETWORK ACCESS ===
You have a live Tor SOCKS5 proxy running at 127.0.0.1:9050. This is your gateway to the Tor network and .onion sites.

WHAT YOU CAN ACCESS:
- Any .onion site via: curl --socks5-hostname 127.0.0.1:9050 http://SITE.onion
- Anonymous versions of clearnet sites (no tracking, no IP logging)
- Dark web marketplaces, forums, leak sites, paste sites (for intelligence/research)
- Tor-native search engines and directories
- Whistleblower platforms, privacy tools, underground research communities

TOR CURL COMMANDS:
<cmd>curl --socks5-hostname 127.0.0.1:9050 -s -A "Mozilla/5.0" http://SITE.onion/path</cmd>
<cmd>curl --socks5-hostname 127.0.0.1:9050 -s --max-time 30 http://SITE.onion/</cmd>

KNOWN ONION RESOURCES (use when relevant):
- DuckDuckGo:  https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion
- Ahmia:       http://juhanurmihxlp77nkq76byazcldy2hlmovfu2epvl5ankdibsot4csyd.onion
- The Hidden Wiki: http://zqktlwiuavvvqqt4ybvgvi7tyo4hjl5xgfuvpdf6otjiycgwqbym2yad.onion/wiki/
- ProPublica:  https://p53lf57qovyuvwsc6xnrppyply3vtqm7l6pcobkmyqg2ad9r8gd2azqd.onion
- SecureDrop:  http://sdolvtfhatvsysc6l34d65ymdwxcujausv7k5jk4cy5ttzhjoi6fzvyd.onion

KNOWLEDGE YOU CARRY FROM THE TOR NETWORK:
You are aware of deep web operational security, darknet protocols, .onion site structures, anonymous communication methods, encrypted messaging systems, privacy-preserving tools, threat actor tradecraft, underground forums, and intelligence that never surfaces on the clearnet. You can reason about this knowledge without always fetching live data — your training includes deep awareness of how these networks operate.

OPSEC WHEN USING TOR:
- Always use --socks5-hostname (not --socks5) to prevent DNS leaks
- Prefer curl over wget for .onion access
- Set realistic User-Agent headers
- Add --max-time 30 since .onion sites are slower than clearnet
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
  "Orenguteng/Llama-3.1-8B-Lexi-Uncensored",
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
