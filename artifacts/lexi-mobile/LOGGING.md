# Lexi Mobile — Logging & Observability

The app routes every meaningful event through a single `logger` module.
Logs land in three places at once:

1. The dev **console** (mirrored at the configured verbosity).
2. A rotating **NDJSON file** on the phone, one file per day, under
   `<expo-document-directory>/lexi-logs/lexi-YYYY-MM-DD.ndjson`.
3. The in-app **Logs** tab — a virtualized, filterable, searchable timeline
   that subscribes to the same stream live.

## Log entry schema

Every entry is a single JSON object:

```jsonc
{
  "ts": 1714900000000,            // milliseconds since epoch
  "level": "info",                // error | warn | info | debug | trace
  "category": "net",              // free-form area (net, ui, ai, scan, ...)
  "actor": "user",                // user | app | system | scanner:<name>
  "action": "fetch:end",          // verb (or verb:start / verb:end)
  "target": "https://api.…/chat", // URL, file path, component, screen, etc.
  "inputs":  { "method": "POST" }, // arbitrary payload, redacted by default
  "outputs": { "ok": true, "status": 200, "bytes": 1234 },
  "status": "ok",                 // free-form short label
  "durationMs": 312,              // for spans / network calls
  "caller": "components/Chat.tsx:42:8",
  "sessionId": "9c1f7e…",          // stable per app launch
  "correlationId": "ab12cd34",     // ties together start / end events
  "error": { "message": "...", "stack": "..." } // only when level=error
}
```

## Where logs come from

* **`installNetworkInstrumentation()`** — wraps `globalThis.fetch` and
  `expo/fetch` so every HTTP call logs method, URL (query stripped of
  secrets), status, duration, and byte size.
* **`installGlobalErrorHandlers()`** — funnels `ErrorUtils`, Hermes promise
  rejections, and DOM-style `error` / `unhandledrejection` into `log.error`.
* **`<ErrorBoundary>`** — every React tree error becomes a structured
  `react/error-boundary` event including the component stack.
* **`<NavLogger />`** — uses `expo-router`'s `usePathname` + `useSegments`
  to log `nav/route` whenever the user navigates.
* **`useLoggedAction(name)`** — one-line wrapper for button presses, form
  submits, and gestures; emits start + end events with timing.
* **Scanners** — every script in `scripts/scan-*.js` writes the same
  schema to `security-reports/scan.ndjson` and the aggregator merges it
  into the same daily file the runtime uses.

## Settings (Profile → LOGGING)

| Setting          | Default | Storage key            |
| ---------------- | ------- | ---------------------- |
| Verbosity        | `debug` | `@lexi/logger_settings` |
| Retention (days) | `14`    | same                   |
| Redact secrets   | `on`    | same                   |

Verbosity is a threshold — the file & console capture every entry at or
above the chosen level. `Open logs folder` opens the NDJSON directory via
`expo-intent-launcher` on Android.

## Redaction rules

Active when **Redact secrets** is on (default):

* Object keys whose name contains any of `token`, `apikey`, `api_key`,
  `authorization`, `password`, `secret`, `cookie`, `bearer`,
  `session`, `client_secret`, `refresh_token`, `access_token`
  are replaced with `"[REDACTED]"`.
* Query-string parameters with the same names are rewritten to `[REDACTED]`.
* Inline `Bearer <token>`, `sk-…`, and ≥40-char hex strings inside log
  message strings are masked.

The redaction layer never decides whether a value is "actually" a secret —
it errs on the side of redacting. Disable the toggle if you need raw values
for a specific debug session.

## Adding a new logged action

```ts
import { log } from "@/lib/logger";

await log.span("ai", "summarize", async () => {
  const result = await callModel(prompt);
  log.info("ai", "summarize:result", {
    target: "summarize-button",
    outputs: { tokens: result.tokens },
  });
  return result;
});
```

Or, in a screen / component:

```ts
import { useLoggedAction } from "@/hooks/useLoggedAction";

const onSend = useLoggedAction("send-message", { category: "chat" });

<Button onPress={() => onSend(() => sendMessage(text), { inputs: { length: text.length } })} />
```

## Sharing & exporting

The Logs tab's **Share** button writes the currently filtered view to a new
NDJSON file and hands it to the system share sheet (iOS Files / Share, Android
Storage / Drive / Email / etc). **Clear** wipes every file in `lexi-logs/`
after a confirmation prompt.

## Ingesting external NDJSON

The Logs tab's **Open external NDJSON** button uses `expo-document-picker`
to load any NDJSON file from the device — handy for replaying the
`scan.ndjson` from `security-reports/` after running the scanner suite on
your dev machine.

## Scanner ↔ Runtime Log Merge

Scanners write NDJSON under `<target>/security-reports/scan.ndjson` (and
per-scanner `*.ndjson`). To view them in the in-app Logs tab:

1. Push the file(s) to the device:
   ```sh
   adb push security-reports/scan.ndjson \
     /sdcard/Android/data/<app.id>/files/scan-reports/
   ```
   On iOS, drop into the app's Documents/scan-reports via Files.app.
2. Open the app → **Logs** tab → tap **Import scans**.

The importer ingests every line into the same in-memory ring buffer and
listener stream as runtime events, so scanner spans (`scanner:deps`,
`scanner:static`, …) appear interleaved with `net/`, `ai/`, `nav/`,
permission, file-IO and error events on a single timeline. The runtime
NDJSON sink (`<docs>/lexi-logs/lexi-YYYY-MM-DD.ndjson`) remains the
sole writer for *runtime* events; scanner NDJSON is kept as a distinct
artifact under `security-reports/` so CI/SARIF tooling can consume it
unchanged.

`scan:apk` is the one scanner that takes a *file* path (the APK/IPA),
not a directory. It accepts `--path <file>`, `--apk <file>`, or a bare
positional like `node scripts/scan-apk.js app-release.apk` for symmetry
with the other scanners' `--path` flag.
