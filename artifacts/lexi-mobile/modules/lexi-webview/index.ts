// Headless WebView form-submit transport.
//
// Lets Lexi act on classic web admin panels that don't expose an API by
// loading the page in a hidden Android WebView / iOS WKWebView, evaluating a
// JS shim that fills named inputs and clicks the submit button, then returning
// the resulting HTML and final URL (after any redirects).
//
// Routing: when `socksProxy` or `httpProxy` is supplied, the native side
// configures the WebView to send all requests through that proxy. This is how
// Lexi keeps form submissions on the same egress path as `stealthFetch`
// (Tor / curl-impersonate / Cronet).
//
// Step audit: the native side calls back into JS via the
// `onStep` event for each phase (navigate / fill / submit / response) so
// `webFormSubmit()` in `lib/ops/actions.ts` can mirror those into the
// operator-eyes drawer for live audit.
import { requireOptionalNativeModule } from "expo";

export type WebFormStep =
  | { phase: "navigate"; url: string }
  | { phase: "fill"; field: string }
  | { phase: "submit"; selector?: string }
  | { phase: "response"; status: number; finalUrl: string };

export type SubmitFormOptions = {
  url: string;
  fields: Record<string, string>;
  /**
   * CSS selector for the submit button. Defaults to
   * `button[type=submit], input[type=submit]` (first match).
   */
  submitSelector?: string;
  /** SOCKS proxy URI from the active stealth backend (e.g. `socks5://127.0.0.1:9150`). */
  socksProxy?: string;
  /** HTTP proxy URI from the active stealth backend. */
  httpProxy?: string;
  /** User-Agent override (matches the picked stealth profile). */
  userAgent?: string;
  /** Hard timeout for the whole load+fill+submit cycle. Default 30s. */
  timeoutMs?: number;
  /** Per-step callback so the operator-eyes drawer can show each phase live. */
  onStep?: (step: WebFormStep) => void;
};

export type SubmitFormResult = {
  status: number;
  finalUrl: string;
  html: string;
  steps: WebFormStep[];
};

type NativeApi = {
  isAvailable(): boolean;
  submitForm(opts: Omit<SubmitFormOptions, "onStep">): Promise<SubmitFormResult>;
  /** Native event subscription. Optional — falls back to polling result.steps. */
  addListener?: (event: "onStep", cb: (step: WebFormStep) => void) => { remove: () => void };
};

const native = requireOptionalNativeModule<NativeApi>("LexiWebView");

export function isWebViewAvailable(): boolean {
  if (!native) return false;
  try {
    return native.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Load `url`, fill `fields` by `name=` attribute, click submit, return the
 * resulting HTML/URL/status. Throws `WEBVIEW_NOT_BUNDLED` if the native
 * module isn't present (e.g. Expo Go or web).
 */
export async function submitForm(opts: SubmitFormOptions): Promise<SubmitFormResult> {
  if (!native) {
    const e = new Error("WEBVIEW_NOT_BUNDLED");
    (e as Error & { code?: string }).code = "WEBVIEW_NOT_BUNDLED";
    throw e;
  }
  const { onStep, ...nativeOpts } = opts;
  let sub: { remove: () => void } | undefined;
  if (onStep && native.addListener) {
    sub = native.addListener("onStep", (s) => {
      try { onStep(s); } catch {}
    });
  }
  try {
    const result = await native.submitForm(nativeOpts);
    if (onStep && !sub) {
      // Native didn't stream events — replay from the returned step log so the
      // operator-eyes drawer still sees every phase in order.
      for (const s of result.steps ?? []) try { onStep(s); } catch {}
    }
    return result;
  } finally {
    sub?.remove();
  }
}
