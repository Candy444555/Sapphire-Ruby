import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();
const routeDir = path.dirname(fileURLToPath(import.meta.url));
type FusedExtension = {
  slug: string;
  description: string;
};

// Extensions file lives in the ai-chat public folder so the browser can load it
const EXTENSIONS_FILE = path.resolve(
  routeDir,
  "../../../../ai-chat/public/lexi-extensions.js"
);

function readExtensions(): string {
  if (!fs.existsSync(EXTENSIONS_FILE)) return "";
  return fs.readFileSync(EXTENSIONS_FILE, "utf-8");
}

function writeExtensions(content: string) {
  const dir = path.dirname(EXTENSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EXTENSIONS_FILE, content, "utf-8");
}

export function sanitizeExtensionName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || `lexi_extension_${Date.now()}`;
}

export function inferCodeLanguage(code: string, hintedLanguage?: string): string {
  const hint = hintedLanguage?.trim().toLowerCase();
  if (hint) return hint;
  if (/^\s*<(!doctype|html|[a-z][\w-]*)(\s|>)/i.test(code)) return "html";
  if (/\b(def|import|from|print)\b|if __name__\s*==\s*["']__main__["']/.test(code)) return "python";
  if (/\b(function|const|let|var|=>|document\.|window\.|export default|import .* from)\b/.test(code)) return "javascript";
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/i.test(code)) return "sql";
  if (/^\s*(#!\/bin\/|sudo |apt |npm |pnpm |python |node |cd |mkdir |rm |cp |mv )/m.test(code)) return "shell";
  if (/[{};]\s*$/.test(code)) return "code";
  return "text";
}

export function inferCodePurpose(code: string, language: string): string {
  const firstComment = code.match(/^\s*(?:\/\/|#|--|\/\*)\s*(.+)$/m)?.[1]?.trim();
  if (firstComment && firstComment.length > 8) return firstComment.slice(0, 160);
  if (/\b(fetch|axios|XMLHttpRequest)\b/.test(code)) return "makes web/API requests and processes the returned data";
  if (/\b(addEventListener|querySelector|getElementById|document\.)\b/.test(code)) return "adds browser page behavior or DOM automation";
  if (/\b(express|router\.|app\.(get|post|put|delete|patch))\b/.test(code)) return "defines backend server routes or request handling";
  if (/\b(useState|useEffect|React|tsx|jsx)\b/.test(code)) return "defines React UI behavior or a React component";
  if (/\b(def |class |print\(|requests\.|pandas|numpy)\b/.test(code)) return "runs a Python automation, data, or utility workflow";
  if (/\bSELECT\b|\bCREATE TABLE\b|\bJOIN\b/i.test(code)) return "queries or modifies database data";
  if (language === "html") return "defines webpage structure or markup";
  if (language === "shell") return "runs terminal automation commands";
  return `provides a reusable ${language} code snippet`;
}

function buildCodeMemoryExtension(slug: string, code: string, description: string, language: string): string {
  return `
const memory = {
  name: ${JSON.stringify(slug)},
  description: ${JSON.stringify(description)},
  language: ${JSON.stringify(language)},
  source: ${JSON.stringify(code)},
  loadedAt: ${JSON.stringify(new Date().toISOString())},
};
if (!window.LexiCodeMemory) window.LexiCodeMemory = {};
window.LexiCodeMemory[${JSON.stringify(slug)}] = memory;
window.getLexiCodeMemory = function getLexiCodeMemory(name) {
  return name ? window.LexiCodeMemory?.[name] : window.LexiCodeMemory;
};
`;
}

export function fuseExtension(name: string, code: string, description?: string): FusedExtension {
  const slug = sanitizeExtensionName(name);
  const existing = readExtensions();
  const timestamp = new Date().toISOString();
  const safeDescription = description ?? "(none)";
  const block = `
// ============================================================
// LEXI EXTENSION: ${slug}
// Added: ${timestamp}
// Description: ${safeDescription}
// ============================================================
(function registerExtension_${slug}() {
  if (!window.LexiExtensions) window.LexiExtensions = {};
  if (window.LexiExtensions["${slug}"]) return;

  try {
${code
  .split("\n")
  .map((l) => "    " + l)
  .join("\n")}

    window.LexiExtensions["${slug}"] = {
      name: "${slug}",
      description: ${JSON.stringify(safeDescription)},
      loadedAt: "${timestamp}",
    };

    console.log("[Lexi] Extension loaded: ${slug}");
    if (window.__lexiExtensionLoaded) window.__lexiExtensionLoaded("${slug}");
  } catch (e) {
    console.error("[Lexi] Extension failed to load: ${slug}", e);
  }
})();
`;

  writeExtensions(existing + block);
  return { slug, description: safeDescription };
}

export function fuseCodeMemory(code: string, hintedLanguage?: string): FusedExtension {
  const language = inferCodeLanguage(code, hintedLanguage);
  const purpose = inferCodePurpose(code, language);
  const suffix = Date.now().toString(36);
  const slug = sanitizeExtensionName(`${language}_${purpose.split(/\s+/).slice(0, 5).join("_")}_${suffix}`);
  const extensionCode = buildCodeMemoryExtension(slug, code, purpose, language);
  return fuseExtension(slug, extensionCode, `Auto-learned ${language} code: ${purpose}`);
}

// GET — return current extensions file
router.get("/self-patch", (_req: Request, res: Response) => {
  const content = readExtensions();
  res.json({ content, lines: content.split("\n").length });
});

// POST — append a new named extension block
router.post("/self-patch", (req: Request, res: Response) => {
  const { name, code, description } = req.body as {
    name?: string;
    code?: string;
    description?: string;
  };

  if (!name || !code) {
    res.status(400).json({ error: "name and code are required" });
    return;
  }

  const { slug } = fuseExtension(name, code, description);
  res.json({ ok: true, slug, message: `Extension "${slug}" fused into Lexi.` });
});

// DELETE /:slug — remove a single extension by slug
router.delete("/self-patch/:slug", (req: Request, res: Response) => {
  const { slug } = req.params;
  const content = readExtensions();
  const blockRegex = new RegExp(
    `\\n// =+\\n// LEXI EXTENSION: ${slug}\\n[\\s\\S]*?\\}\\)\\(\\);\\n`,
    "g"
  );
  const updated = content.replace(blockRegex, "\n");
  writeExtensions(updated);
  res.json({ ok: true, slug, message: `Extension "${slug}" removed.` });
});

// DELETE — clear all extensions (reset to blank)
router.delete("/self-patch", (_req: Request, res: Response) => {
  writeExtensions("// Lexi Extensions — auto-generated by self-patch system\n");
  res.json({ ok: true, message: "All extensions cleared." });
});

export default router;
