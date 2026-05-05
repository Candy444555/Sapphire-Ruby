// Single source of truth for every scanner the operator can run from
// the Scan tab. Server-side tools mirror artifacts/api-server/src/routes/scan.ts;
// phone-only tools are implemented in lib/scanners/on-phone.ts.
//
// Forge-installed tools are merged in at runtime via the tool-forge module.

export type SourceKind = "file" | "apk" | "zip" | "github" | "workspace" | "screen";

export type ToolDef = {
  id: string;
  label: string;
  description: string;
  category: "sast" | "secrets" | "deps" | "mobile" | "ai" | "quality" | "forged";
  runsOn: "phone" | "server" | "either";
  needsServer: boolean;
  acceptsSources: SourceKind[];
  // For server tools: nothing to import. For phone tools, this is filled in
  // by lib/scanners/on-phone.ts at module load.
  phoneRunner?: (target: { kind: "text" | "file"; filename: string; content: string }) => Promise<NormalizedFinding[]>;
};

export type NormalizedFinding = {
  tool: string;
  severity: "low" | "medium" | "high" | "critical";
  file?: string;
  line?: number;
  rule?: string;
  summary: string;
  // Original payload, kept for Fix/Reproduce.
  raw?: unknown;
};

export const BUILTIN_TOOLS: ToolDef[] = [
  // ── SAST ──────────────────────────────────────────────────────────
  {
    id: "semgrep",
    label: "Semgrep",
    description: "Multi-language SAST (OWASP, JS/TS, React, secrets)",
    category: "sast",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "eslint",
    label: "ESLint security",
    description: "JS/TS lint with security rules",
    category: "sast",
    runsOn: "either",
    needsServer: false,
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "bandit",
    label: "bandit",
    description: "Python security linter",
    category: "sast",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "njsscan",
    label: "njsscan",
    description: "Node.js security scanner",
    category: "sast",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "bearer",
    label: "Bearer",
    description: "Data-flow SAST (sensitive data tracking)",
    category: "sast",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "nuclei",
    label: "nuclei",
    description: "Template-based vuln/code-pattern scan",
    category: "sast",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  // ── Secrets ───────────────────────────────────────────────────────
  {
    id: "gitleaks",
    label: "gitleaks",
    description: "Detect committed secrets (AWS/GCP/keys/tokens)",
    category: "secrets",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "trufflehog",
    label: "trufflehog",
    description: "Verified secret detection across files",
    category: "secrets",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "regex-secrets",
    label: "Regex secrets (on-phone)",
    description: "Lightweight on-device secret regex scan — works offline",
    category: "secrets",
    runsOn: "phone",
    needsServer: false,
    acceptsSources: ["file", "screen"],
  },
  // ── Deps ──────────────────────────────────────────────────────────
  {
    id: "deps",
    label: "pnpm/npm audit",
    description: "Node dependency CVE audit",
    category: "deps",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "trivy",
    label: "Trivy",
    description: "Filesystem CVE / SBOM / IaC scan",
    category: "deps",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  {
    id: "retire",
    label: "retire.js",
    description: "Detect known-vulnerable JS libraries",
    category: "deps",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  // ── Mobile ────────────────────────────────────────────────────────
  {
    id: "apk",
    label: "MobSF (static APK)",
    description: "Static security analysis of an Android APK",
    category: "mobile",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["apk"],
  },
  {
    id: "apktool",
    label: "apktool + jadx",
    description: "Decompile APK to source then re-scan with semgrep + secrets + AI",
    category: "mobile",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["apk"],
  },
  // ── Quality / misc ────────────────────────────────────────────────
  {
    id: "expo",
    label: "expo-doctor",
    description: "Validate Expo project config + dependencies",
    category: "quality",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["workspace", "zip", "github"],
  },
  {
    id: "shell",
    label: "shellcheck",
    description: "Shell script linter",
    category: "quality",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["file", "zip", "github", "workspace"],
  },
  {
    id: "quality",
    label: "Code quality",
    description: "Style + complexity heuristics",
    category: "quality",
    runsOn: "server",
    needsServer: true,
    acceptsSources: ["zip", "github", "workspace"],
  },
  // ── AI review ─────────────────────────────────────────────────────
  {
    id: "ai-review",
    label: "AI code review (Featherless)",
    description: "Lexi reviews code/diff for bugs, vulns, smells",
    category: "ai",
    runsOn: "either",
    needsServer: false,
    acceptsSources: ["file", "github", "workspace", "screen"],
  },
];

export function findTool(id: string): ToolDef | undefined {
  return BUILTIN_TOOLS.find((t) => t.id === id);
}
