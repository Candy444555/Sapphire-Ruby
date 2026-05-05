// On-phone scanners: pure-JS implementations that run inside the app without
// needing the api-server. Currently: regex-based secret sweep.
import { normalizeFinding, type NormalizedFinding } from "@/lib/findings/contract";

const SECRET_RULES: { id: string; severity: "high" | "medium"; pattern: RegExp; title: string }[] = [
  { id: "aws-access-key", severity: "high", pattern: /\bAKIA[0-9A-Z]{16}\b/g, title: "AWS access key id" },
  { id: "github-pat", severity: "high", pattern: /\bghp_[A-Za-z0-9]{30,}\b/g, title: "GitHub personal access token" },
  { id: "google-api-key", severity: "medium", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, title: "Google API key" },
  { id: "slack-token", severity: "high", pattern: /\bxox[abp]-[A-Za-z0-9-]{10,}\b/g, title: "Slack token" },
  { id: "openai-key", severity: "high", pattern: /\bsk-[A-Za-z0-9]{32,}\b/g, title: "OpenAI-style API key" },
  { id: "private-key", severity: "high", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, title: "Private key block" },
];

export type FileBlob = { name: string; text: string };

export function regexSecretsScan(files: FileBlob[], correlationId?: string): NormalizedFinding[] {
  const out: NormalizedFinding[] = [];
  for (const file of files) {
    if (!file.text) continue;
    for (const rule of SECRET_RULES) {
      let m: RegExpExecArray | null;
      const r = new RegExp(rule.pattern.source, rule.pattern.flags);
      while ((m = r.exec(file.text)) !== null) {
        const before = file.text.slice(0, m.index);
        const line = before.split("\n").length;
        out.push(
          normalizeFinding("regex-secrets", {
            id: rule.id, severity: rule.severity, title: rule.title,
            file: file.name, line, description: `Matched literal: ${m[0].slice(0, 12)}…`,
          }, correlationId),
        );
      }
    }
  }
  return out;
}
