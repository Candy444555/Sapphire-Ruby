import { fetch as expoFetch } from "expo/fetch";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;

export type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

export async function streamLexi(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: { model?: string; systemPrompt?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const model = opts.model ?? "lexi-uncensored-v2-8b";
  const res = await expoFetch(`${BASE}/api/chat/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, systemPrompt: opts.systemPrompt }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Chat failed: HTTP ${res.status}`);
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data: ")) continue;
      const payload = t.slice(6);
      if (payload === "[DONE]") return;
      if (payload.startsWith("[ERROR]")) throw new Error(payload);
      try {
        const tok = JSON.parse(payload);
        if (typeof tok === "string") onToken(tok);
      } catch {}
    }
  }
}

export async function generateImage(prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/media/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const json = await res.json();
  if (!json.dataUrl) throw new Error(json.error ?? "Image generation failed");
  return json.dataUrl as string;
}

export async function analyzeImages(prompt: string, imageDataUrls: string[]): Promise<string> {
  const res = await fetch(`${BASE}/api/media/vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, imageDataUrls }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.analysis as string;
}

export async function runCode(language: string, code: string): Promise<{
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}> {
  const res = await fetch(`${BASE}/api/code/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code }),
  });
  return res.json();
}
