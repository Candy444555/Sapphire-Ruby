import { fetch as expoFetchRaw } from "expo/fetch";
import { log } from "@/lib/logger";

type ExpoFetch = typeof expoFetchRaw;
type ExpoFetchArgs = Parameters<ExpoFetch>;
type ExpoFetchResult = Awaited<ReturnType<ExpoFetch>>;

function safeUrl(input: ExpoFetchArgs[0]): string {
  try {
    if (typeof input === "string") return input;
    if (input && typeof input === "object" && "url" in input) return String((input as { url: string }).url);
    return String(input);
  } catch {
    return "<unknown>";
  }
}

export const expoFetch: ExpoFetch = (async (...args: ExpoFetchArgs): Promise<ExpoFetchResult> => {
  const url = safeUrl(args[0]);
  const method = (args[1]?.method ?? "GET").toUpperCase();
  return log.span("net", `expoFetch ${method}`, async () => {
    const res = await expoFetchRaw(...args);
    log.debug("net", "expoFetch:response", {
      actor: "system",
      target: url,
      outputs: { status: res.status, ok: res.ok },
    });
    return res;
  }, { actor: "system", target: url });
}) as ExpoFetch;
