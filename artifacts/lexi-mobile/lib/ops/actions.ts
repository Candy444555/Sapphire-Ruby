// Scope A operator-actions module.
//
// Every write call here is routed through `runGuards(action)` from
// `lib/ops/guardrails.ts` BEFORE the request leaves the device. With no rules
// registered, that's a no-op pass-through — exactly as the task specifies.

import { stealthFetch } from "@/lib/stealth-fetch";
import { runGuards, type ActionDescriptor } from "@/lib/ops/guardrails";
import { pushOpsEvent } from "@/lib/stealth/operator-eyes";
import { isWebViewAvailable, submitForm as webViewSubmitForm, type WebFormStep } from "../../modules/lexi-webview";
import { getActiveBackend, withSocksOrProxy } from "@/lib/stealth/backends";
import { getActiveProfile } from "@/lib/stealth/profiles";

export type OpsResult<T = unknown> = {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
  decision: "allow" | "block" | "confirm" | "dry-run-only";
  notes?: string[];
};

async function gated<T>(a: ActionDescriptor, exec: (a: ActionDescriptor) => Promise<{ status: number; data: T }>): Promise<OpsResult<T>> {
  const outcome = await runGuards(a);
  switch (outcome.decision) {
    case "block":
      pushOpsEvent("guardrail", `BLOCKED ${a.method} ${a.url}`, { reason: outcome.reason });
      return { ok: false, decision: "block", error: outcome.reason };
    case "confirm":
      pushOpsEvent("guardrail", `CONFIRM-REQUIRED ${a.method} ${a.url}`, { prompts: outcome.prompts });
      return { ok: false, decision: "confirm", error: outcome.prompts.join(" / "), notes: outcome.prompts };
    case "dry-run-only":
      pushOpsEvent("guardrail", `DRY-RUN ${a.method} ${a.url}`, { reasons: outcome.reasons });
      return { ok: true, decision: "dry-run-only", notes: outcome.reasons };
    case "allow":
      try {
        const r = await exec(outcome.rewritten);
        return { ok: r.status < 400, status: r.status, data: r.data, decision: "allow" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushOpsEvent("error", `op failed: ${a.method} ${a.url}`, { error: msg });
        return { ok: false, decision: "allow", error: msg };
      }
  }
}

// ───────── HTTP/REST ─────────

export async function httpRequest<T = unknown>(opts: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  blastRadius?: ActionDescriptor["estimatedBlastRadius"];
  tags?: Record<string, string>;
}): Promise<OpsResult<T>> {
  const a: ActionDescriptor = {
    kind: "http",
    target: hostname(opts.url),
    url: opts.url,
    method: opts.method,
    payload: opts.body,
    estimatedBlastRadius: opts.blastRadius,
    tags: opts.tags,
  };
  return gated<T>(a, async (final) => {
    const init: RequestInit = {
      method: final.method,
      headers: opts.headers,
      body: final.payload != null && !/^(GET|HEAD)$/i.test(final.method)
        ? (typeof final.payload === "string" ? final.payload : JSON.stringify(final.payload))
        : undefined,
    };
    const r = await stealthFetch(final.url, init);
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch {}
    return { status: r.status, data: parsed as T };
  });
}

// ───────── GraphQL ─────────

export async function graphql<T = unknown>(opts: {
  endpoint: string;
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  blastRadius?: ActionDescriptor["estimatedBlastRadius"];
}): Promise<OpsResult<T>> {
  return httpRequest<T>({
    url: opts.endpoint,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: { query: opts.query, variables: opts.variables ?? {} },
    blastRadius: opts.blastRadius,
    tags: { kind: "graphql" },
  });
}

// ───────── Cloud control planes (signed-request stubs) ─────────
//
// These are thin wrappers that build correctly-shaped requests and then route
// through `httpRequest`. The signing math (SigV4, Azure AAD bearer, GCP IAM
// metadata-server, DO bearer) is delegated to the credentials provider on
// device (see `getCredential()` below). Operator brings keys.

import { secureGet, secureSet, secureDelete } from "@/lib/ops/secure-store";
import { signV4 } from "@/lib/ops/sigv4";

const CRED_KEY = "lexi.ops.credentials.v1";

export type CredentialName = "aws" | "azure" | "gcp" | "do" | "github" | "gitlab" | "jira" | "salesforce" | "ms-graph" | "google-workspace";

export type CredentialBag = Partial<Record<CredentialName, Record<string, string>>>;

export async function loadCredentials(): Promise<CredentialBag> {
  try { const r = await secureGet(CRED_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

export async function saveCredential(name: CredentialName, value: Record<string, string>): Promise<void> {
  const all = await loadCredentials();
  all[name] = value;
  await secureSet(CRED_KEY, JSON.stringify(all));
}

export async function deleteCredential(name: CredentialName): Promise<void> {
  const all = await loadCredentials();
  delete all[name];
  if (Object.keys(all).length === 0) await secureDelete(CRED_KEY);
  else await secureSet(CRED_KEY, JSON.stringify(all));
}

export async function getCredential(name: CredentialName): Promise<Record<string, string> | null> {
  const all = await loadCredentials();
  return all[name] ?? null;
}

export async function bearer(name: CredentialName): Promise<Record<string, string>> {
  const c = await getCredential(name);
  const tok = c?.token ?? c?.access_token ?? c?.bearer;
  if (!tok) throw new Error(`No credential for ${name} — add it in Profile → Operator credentials.`);
  return { Authorization: `Bearer ${tok}` };
}

export async function awsRequest<T = unknown>(opts: {
  region: string;
  service: string;
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  blastRadius?: ActionDescriptor["estimatedBlastRadius"];
}): Promise<OpsResult<T>> {
  const cred = await getCredential("aws");
  if (!cred?.accessKeyId || !cred?.secretAccessKey) {
    return { ok: false, decision: "block", error: "AWS credentials not configured" };
  }
  const signed = signV4({
    region: opts.region,
    service: opts.service,
    accessKeyId: cred.accessKeyId,
    secretAccessKey: cred.secretAccessKey,
    sessionToken: cred.sessionToken,
    method: opts.method,
    url: opts.url,
    headers: opts.headers,
    body: opts.body,
  });
  return httpRequest<T>({
    url: signed.url,
    method: signed.method,
    headers: signed.headers,
    body: signed.body,
    blastRadius: opts.blastRadius ?? "many",
    tags: { kind: "cloud", provider: "aws", service: opts.service, region: opts.region },
  });
}

export async function azureRequest<T = unknown>(opts: { url: string; method: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }): Promise<OpsResult<T>> {
  const h = await bearer("azure");
  return httpRequest<T>({ url: opts.url, method: opts.method, headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius ?? "many", tags: { kind: "cloud", provider: "azure" } });
}

export async function gcpRequest<T = unknown>(opts: { url: string; method: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }): Promise<OpsResult<T>> {
  const h = await bearer("gcp");
  return httpRequest<T>({ url: opts.url, method: opts.method, headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius ?? "many", tags: { kind: "cloud", provider: "gcp" } });
}

export async function doRequest<T = unknown>(opts: { url: string; method: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }): Promise<OpsResult<T>> {
  const h = await bearer("do");
  return httpRequest<T>({ url: opts.url, method: opts.method, headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius ?? "many", tags: { kind: "cloud", provider: "do" } });
}

// ───────── SaaS API helpers ─────────

export async function msGraph<T = unknown>(opts: { path: string; method?: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }) {
  const h = await bearer("ms-graph");
  return httpRequest<T>({ url: `https://graph.microsoft.com/v1.0${opts.path}`, method: opts.method ?? "GET", headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius, tags: { kind: "saas", provider: "ms-graph" } });
}

export async function googleWorkspace<T = unknown>(opts: { url: string; method?: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }) {
  const h = await bearer("google-workspace");
  return httpRequest<T>({ url: opts.url, method: opts.method ?? "GET", headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius, tags: { kind: "saas", provider: "google-workspace" } });
}

export async function salesforce<T = unknown>(opts: { instanceUrl: string; path: string; method?: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }) {
  const h = await bearer("salesforce");
  return httpRequest<T>({ url: `${opts.instanceUrl.replace(/\/$/, "")}${opts.path}`, method: opts.method ?? "GET", headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius, tags: { kind: "saas", provider: "salesforce" } });
}

export async function github<T = unknown>(opts: { path: string; method?: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }) {
  const h = await bearer("github");
  return httpRequest<T>({ url: `https://api.github.com${opts.path}`, method: opts.method ?? "GET", headers: { "Accept": "application/vnd.github+json", ...h }, body: opts.body, blastRadius: opts.blastRadius, tags: { kind: "saas", provider: "github" } });
}

export async function gitlab<T = unknown>(opts: { instanceUrl?: string; path: string; method?: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }) {
  const h = await bearer("gitlab");
  const base = opts.instanceUrl ?? "https://gitlab.com";
  return httpRequest<T>({ url: `${base.replace(/\/$/, "")}/api/v4${opts.path}`, method: opts.method ?? "GET", headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius, tags: { kind: "saas", provider: "gitlab" } });
}

export async function jira<T = unknown>(opts: { instanceUrl: string; path: string; method?: string; body?: unknown; blastRadius?: ActionDescriptor["estimatedBlastRadius"] }) {
  const h = await bearer("jira");
  return httpRequest<T>({ url: `${opts.instanceUrl.replace(/\/$/, "")}/rest/api/3${opts.path}`, method: opts.method ?? "GET", headers: { "Content-Type": "application/json", ...h }, body: opts.body, blastRadius: opts.blastRadius, tags: { kind: "saas", provider: "jira" } });
}

// ───────── Web-form submit ─────────
//
// Two transports:
//
//  1. "fetch"   — POST application/x-www-form-urlencoded or multipart/form-data
//                 through `stealthFetch`. Covers classic server-rendered admin
//                 panels (no JS validation, no anti-CSRF token round-trip).
//
//  2. "webview" — load the page in a hidden Android WebView / iOS WKWebView
//                 via the `lexi-webview` native module, evaluate a JS shim
//                 that fills `name=`d inputs and clicks submit, then return
//                 the resulting HTML / final URL / status. Required for SPA
//                 forms, hidden CSRF tokens, JS-mutated submit handlers, etc.
//                 The WebView is configured with the active stealth backend's
//                 SOCKS/HTTP proxy and stealth profile User-Agent so its
//                 egress matches `stealthFetch`.
//
// "auto" (default) prefers the WebView when the native module is bundled and
// falls back to fetch otherwise.
//
// Each phase (navigate / fill <field> / click submit / response) is mirrored
// into the operator-eyes drawer so the operator can audit the form-fill
// step-by-step.
export async function webFormSubmit(opts: {
  url: string;
  fields: Record<string, string>;
  encoding?: "urlencoded" | "multipart";
  transport?: "fetch" | "webview" | "auto";
  submitSelector?: string;
  userAgent?: string;
  timeoutMs?: number;
  blastRadius?: ActionDescriptor["estimatedBlastRadius"];
}): Promise<OpsResult> {
  const transport = opts.transport ?? "auto";
  const wantWebView = transport === "webview" || (transport === "auto" && isWebViewAvailable());
  const a: ActionDescriptor = {
    kind: "web-form",
    target: hostname(opts.url),
    url: opts.url,
    method: "POST",
    payload: opts.fields,
    estimatedBlastRadius: opts.blastRadius,
    tags: {
      kind: "web-form",
      encoding: opts.encoding ?? "urlencoded",
      transport: wantWebView ? "webview" : "fetch",
    },
  };
  return gated(a, async (final) => {
    const fields = (final.payload as Record<string, string>) ?? {};

    if (wantWebView) {
      if (!isWebViewAvailable()) {
        // Operator explicitly asked for the WebView transport but the native
        // module isn't bundled (Expo Go, web, broken build). Surface the
        // distinct error so they can switch transport or rebuild.
        const e = new Error("WEBVIEW_NOT_BUNDLED: headless WebView native module is not in this build");
        (e as Error & { code?: string }).code = "WEBVIEW_NOT_BUNDLED";
        throw e;
      }
      const backend = getActiveBackend();
      // FAIL-CLOSED proxy resolution: if the active backend can't surface
      // its proxy (Tor not bootstrapped, residential session expired,
      // misconfigured backend), we MUST refuse rather than fall through
      // to direct egress. Mirrors the model `stealthFetch` enforces. We
      // only allow `direct` (`{}`) when the active backend itself is
      // explicitly direct.
      let proxy: { socksProxy?: string; httpProxy?: string };
      try {
        proxy = await withSocksOrProxy(backend);
      } catch (err) {
        const e = new Error(
          `WEBVIEW_PROXY_REQUIRED: active backend "${backend}" failed to provide a proxy ` +
          `(${err instanceof Error ? err.message : String(err)}); refusing to send the WebView request direct.`
        );
        (e as Error & { code?: string }).code = "WEBVIEW_PROXY_REQUIRED";
        throw e;
      }
      const hasAnyProxy = !!(proxy.socksProxy || proxy.httpProxy);
      if (!hasAnyProxy && backend !== "direct") {
        const e = new Error(
          `WEBVIEW_PROXY_REQUIRED: active backend "${backend}" returned no proxy; refusing to send the WebView request direct.`
        );
        (e as Error & { code?: string }).code = "WEBVIEW_PROXY_REQUIRED";
        throw e;
      }
      // Proxy parity: SOCKS-only backends (notably Tor) are honored by the
      // native module's local SOCKS→HTTP-CONNECT bridge (see
      // `modules/lexi-webview/android/.../SocksHttpBridge.kt` and the iOS
      // counterpart). The native module also fails closed if it can't apply
      // any proxy (e.g. iOS <17 without a SOCKS bridge).
      const profile = (() => { try { return getActiveProfile(); } catch { return null; } })();
      const ua = opts.userAgent ?? profile?.headers.find(([k]) => k.toLowerCase() === "user-agent")?.[1];
      pushOpsEvent("info", `web-form: webview start ${final.url}`, {
        backend, fields: Object.keys(fields), proxy: proxy.socksProxy ? "socks(bridged)" : proxy.httpProxy ? "http" : "direct",
      });
      const onStep = (s: WebFormStep) => {
        switch (s.phase) {
          case "navigate":
            pushOpsEvent("info", `web-form: navigate ${s.url}`); break;
          case "fill":
            pushOpsEvent("info", `web-form: fill ${s.field}`); break;
          case "submit":
            pushOpsEvent("info", `web-form: click submit`, s.selector ? { selector: s.selector } : undefined); break;
          case "response":
            pushOpsEvent("response", `web-form: ${s.status} ${s.finalUrl}`, { status: s.status }); break;
        }
      };
      const result = await webViewSubmitForm({
        url: final.url,
        fields,
        submitSelector: opts.submitSelector,
        socksProxy: proxy.socksProxy,
        httpProxy: proxy.httpProxy,
        userAgent: ua,
        timeoutMs: opts.timeoutMs ?? 30_000,
        onStep,
      });
      return {
        status: result.status,
        data: { html: result.html, finalUrl: result.finalUrl, steps: result.steps },
      };
    }

    // ── fetch transport ──
    const enc = opts.encoding ?? "urlencoded";
    let body: string;
    let contentType: string;
    if (enc === "multipart") {
      const boundary = "----LexiFormBoundary" + Math.random().toString(36).slice(2);
      const lines: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        lines.push(`--${boundary}`);
        lines.push(`Content-Disposition: form-data; name="${k.replace(/"/g, '\\"')}"`);
        lines.push("");
        lines.push(String(v));
      }
      lines.push(`--${boundary}--`); lines.push("");
      body = lines.join("\r\n");
      contentType = `multipart/form-data; boundary=${boundary}`;
    } else {
      body = Object.entries(fields)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      contentType = "application/x-www-form-urlencoded";
    }
    pushOpsEvent("info", `web-form: fetch POST ${final.url}`, { fields: Object.keys(fields), encoding: enc });
    for (const k of Object.keys(fields)) pushOpsEvent("info", `web-form: fill ${k}`);
    pushOpsEvent("info", `web-form: submit`);
    const r = await stealthFetch(final.url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch {}
    pushOpsEvent("response", `web-form: ${r.status} ${final.url}`, { status: r.status });
    return { status: r.status, data: parsed };
  });
}

function hostname(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}
