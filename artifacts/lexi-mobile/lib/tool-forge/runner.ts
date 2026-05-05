// Execute an approved forged tool against a set of files (on-phone for JS).
import { log } from "@/lib/logger";
import { normalizeFinding, type NormalizedFinding } from "@/lib/findings/contract";
import { getInstalledBySlug } from "./approval-queue";
import type { FileBlob } from "@/lib/scanners/phone-scanners";

export async function runForgedTool(slug: string, files: FileBlob[], correlationId?: string): Promise<NormalizedFinding[]> {
  const spec = await getInstalledBySlug(slug);
  if (!spec) return [];
  log.info("scan", "forge:run", { correlationId, target: slug });
  if (spec.language !== "javascript") {
    // Server-side execution would happen here; not implemented on-phone.
    return [];
  }
  const out: NormalizedFinding[] = [];
  // Forged JS scanners must export `function scan(file: {name,text}): Finding[]`.
  //
  // TRUST BOUNDARY: `new Function(...)` is NOT a true sandbox — it executes in
  // the JS realm and inherits whatever globals (fetch, AsyncStorage, etc.) are
  // accessible from this module. We rely on TWO operator gates to keep this
  // safe: (1) the scanner must be Approved by the operator before it lands in
  // the installed registry, and (2) the operator can Edit/Delete it at any
  // time. Treat forged JS tools as trusted-by-operator code, not a sandbox.
  // True isolation (workers, vm-shim, capability-restricted globals) is
  // tracked as future work — see SECURITY.md "Forged tool execution".
  let scanFn: ((file: FileBlob) => Array<Record<string, unknown>>) | null = null;
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      "module",
      `"use strict";\n${spec.source}\nreturn typeof scan === "function" ? scan : (module.exports && module.exports.scan);`,
    ) as (mod: { exports: Record<string, unknown> }) => ((file: FileBlob) => Array<Record<string, unknown>>) | null;
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    scanFn = factory(mod);
  } catch (err) {
    log.error("scan", "forge:compile", { target: slug, error: err });
    return [];
  }
  if (!scanFn) return [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (spec.targetFileTypes.length && ext && !spec.targetFileTypes.includes(ext) && !spec.targetFileTypes.includes("*")) continue;
    try {
      const raw = scanFn(file) || [];
      for (const r of raw) out.push(normalizeFinding(slug, r, correlationId));
    } catch (err) {
      log.warn("scan", "forge:scan-error", { target: `${slug}:${file.name}`, error: err });
    }
  }
  return out;
}
