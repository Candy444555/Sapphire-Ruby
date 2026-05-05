// Single source of truth for every scanner the operator can run from
// the Scan tab. Server-side tools mirror artifacts/api-server/src/routes/scan.ts;
// phone-only tools are implemented in lib/scanners/on-phone.ts.
//
// Forge-installed tools are merged in at runtime via the tool-forge module.
import { log } from "@/lib/logger";
import { type NormalizedFinding } from "@/lib/findings/contract";

export { type NormalizedFinding } from "@/lib/findings/contract";

export type SourceKind = "file" | "apk" | "zip" | "github" | "workspace" | "screen";

export type ScannerCategory = "sast" | "secrets" | "deps" | "mobile" | "ai" | "quality" | "forged";

export type ScannerRunsOn = "phone" | "server" | "either";

export type ScannerSpec = {
  id: string;
  label: string;
  description: string;
  category: ScannerCategory;
  languages: string[];      // e.g. ["js","ts"], ["python"], ["*"]
  runsOn: ScannerRunsOn;
  needsServer: boolean;
  fixContract: true;        // every tool MUST flow through findings/contract
  acceptsSources: SourceKind[];
  forged?: boolean;         // true for tools created via Tool-Forge
  source?: "builtin" | "forged";
  // For server tools: nothing to import. For phone tools, this is filled in
  // by lib/scanners/on-phone.ts at module load.
  phoneRunner?: (target: { kind: "text" | "file"; filename: string; content: string }) => Promise<NormalizedFinding[]>;
};

/** Alias for ScannerSpec to keep HEAD consumers working */
export type ToolDef = ScannerSpec;

export const BUILTIN_TOOLS: ScannerSpec[] = [
  // ── SAST ──────────────────────────────────────────────────────────
  {
    id: "semgrep",
    label: "Semgrep",
    description: "Multi-language SAST (OWASP, JS/TS, React, secrets)",
    category: "sast",
    languages: ["js", "ts", "py", "go", "java"],
    runsOn: "either",
    needsServer: false,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "eslint-security",
    label: "ESLint security",
    description: "JS/TS lint with security rules",
    category: "sast",
    languages: ["js", "ts"],
    runsOn: "either",
    needsServer: false,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "bandit",
    label: "Bandit",
    description: "Python security linter",
    category: "sast",
    languages: ["py"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "njsscan",
    label: "njsscan",
    description: "Node.js security scanner",
    category: "sast",
    languages: ["js", "ts"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "bearer",
    label: "Bearer",
    description: "Data-flow SAST (sensitive data tracking)",
    category: "sast",
    languages: ["js", "ts", "py", "ruby"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "nuclei",
    label: "Nuclei",
    description: "Template-based vuln/code-pattern scan",
    category: "sast",
    languages: ["*"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  // ── Secrets ───────────────────────────────────────────────────────
  {
    id: "gitleaks",
    label: "Gitleaks",
    description: "Detect committed secrets (AWS/GCP/keys/tokens)",
    category: "secrets",
    languages: ["*"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "trufflehog",
    label: "TruffleHog",
    description: "Verified secret detection across files",
    category: "secrets",
    languages: ["*"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "regex-secrets",
    label: "Regex secrets (on-phone)",
    description: "Lightweight on-device secret regex scan — works offline",
    category: "secrets",
    languages: ["*"],
    runsOn: "phone",
    needsServer: false,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "screen"],
  },
  // ── Deps ──────────────────────────────────────────────────────────
  {
    id: "pnpm-audit",
    label: "pnpm audit",
    description: "Node dependency CVE audit",
    category: "deps",
    languages: ["js", "ts"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "trivy",
    label: "Trivy",
    description: "Filesystem CVE / SBOM / IaC scan",
    category: "deps",
    languages: ["*"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "retire",
    label: "retire.js",
    description: "Detect known-vulnerable JS libraries",
    category: "deps",
    languages: ["js"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "mobsf",
    label: "MobSF (static APK)",
    description: "Static security analysis of an Android APK",
    category: "mobile",
    languages: ["apk"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["apk"],
  },
  {
    id: "dep-scan",
    label: "Dependency Scan",
    description: "General dependency vulnerability scanner",
    category: "deps",
    languages: ["*"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  // ── Mobile ────────────────────────────────────────────────────────
  {
    id: "apktool",
    label: "apktool",
    description: "APK decompile (smali + resources)",
    category: "mobile",
    languages: ["apk"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["apk"],
  },
  {
    id: "jadx",
    label: "jadx",
    description: "APK → Java sources",
    category: "mobile",
    languages: ["apk"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["apk"],
  },
  // ── Quality / misc ────────────────────────────────────────────────
  {
    id: "expo-doctor",
    label: "expo-doctor",
    description: "Validate Expo project config + dependencies",
    category: "quality",
    languages: ["js", "ts"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["workspace", "zip", "github"],
  },
  {
    id: "shell",
    label: "shellcheck",
    description: "Shell script linter",
    category: "quality",
    languages: ["sh"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "quality",
    label: "Code quality",
    description: "Style + complexity heuristics",
    category: "quality",
    languages: ["*"],
    runsOn: "server",
    needsServer: true,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["zip", "github", "workspace"],
  },
  // ── AI review ─────────────────────────────────────────────────────
  {
    id: "ai-review",
    label: "AI code review (Featherless)",
    description: "Lexi reviews code/diff for bugs, vulns, smells",
    category: "ai",
    languages: ["*"],
    runsOn: "either",
    needsServer: false,
    fixContract: true,
    source: "builtin",
    acceptsSources: ["file", "github", "workspace", "screen"],
  },
];

const forged = new Map<string, ScannerSpec>();
const listeners = new Set<() => void>();

export function listScanners(): ScannerSpec[] {
  return [...BUILTIN_TOOLS, ...forged.values()];
}

export function getScanner(id: string): ScannerSpec | undefined {
  return BUILTIN_TOOLS.find((s) => s.id === id) ?? forged.get(id);
}

/** Legacy alias for getScanner */
export function findTool(id: string): ToolDef | undefined {
  return getScanner(id);
}

export function registerForgedTool(spec: Omit<ScannerSpec, "fixContract" | "forged" | "source" | "category">): ScannerSpec {
  const full: ScannerSpec = {
    ...spec,
    category: "forged",
    fixContract: true,
    forged: true,
    source: "forged",
    acceptsSources: spec.acceptsSources || ["file", "workspace"],
  };
  forged.set(spec.id, full);
  log.info("scan", "forge:registered", { actor: "system", target: spec.id, outputs: { runsOn: spec.runsOn } });
  for (const fn of listeners) try { fn(); } catch { /* ignore */ }
  return full;
}

export function unregisterForgedTool(id: string): void {
  if (forged.delete(id)) {
    log.info("scan", "forge:unregistered", { actor: "user", target: id });
    for (const fn of listeners) try { fn(); } catch { /* ignore */ }
  }
}

export function subscribeRegistry(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

