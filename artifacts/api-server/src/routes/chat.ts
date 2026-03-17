import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";

const router: IRouter = Router();

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const ChatRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(ChatMessageSchema),
  systemPrompt: z.string().optional(),
});

// All verified working as of latest test
export const UNCENSORED_MODEL_ENDPOINTS: Record<string, string> = {
  "hermes-4-70b":          "nousresearch/hermes-4-70b",
  "hermes-3-llama31-405b": "nousresearch/hermes-3-llama-3.1-405b",
  "hermes-3-llama31-70b":  "nousresearch/hermes-3-llama-3.1-70b",
  "hermes-2-pro-llama3-8b":"nousresearch/hermes-2-pro-llama-3-8b",
  "euryale-v23-70b":       "sao10k/l3.3-euryale-70b",
  "euryale-v22-70b":       "sao10k/l3.1-euryale-70b",
  "euryale-v21-70b":       "sao10k/l3-euryale-70b",
  "magnum-v4-72b":         "anthracite-org/magnum-v4-72b",
  "mythomax-l2-13b":       "gryphe/mythomax-l2-13b",
  "remm-slerp-l2-13b":     "undi95/remm-slerp-l2-13b",
};

async function streamChat(
  modelId: string,
  messages: { role: string; content: string }[],
  systemPrompt: string | undefined,
  res: Response
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
    return;
  }

  const openRouterMessages: { role: string; content: string }[] = [];
  if (systemPrompt?.trim()) {
    openRouterMessages.push({ role: "system", content: systemPrompt });
  }
  openRouterMessages.push(...messages);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://replit.com",
        "X-Title": "Uncensored AI Chat",
      },
      body: JSON.stringify({
        model: modelId,
        messages: openRouterMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorMsg = parsed?.error?.message || parsed?.error || errorText;
      } catch {}
      res.write(`data: [ERROR] ${errorMsg}\n\n`);
      res.end();
      return;
    }

    if (!response.body) {
      res.write(`data: [ERROR] No response body from OpenRouter\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed === "data: [DONE]") {
          done = true;
          break;
        }

        if (!trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        try {
          const chunk = JSON.parse(jsonStr);
          const token = chunk.choices?.[0]?.delta?.content;
          if (token != null) {
            // JSON-encode so newlines/special chars never break SSE format
            res.write(`data: ${JSON.stringify(token)}\n\n`);
          }
          if (chunk.choices?.[0]?.finish_reason != null) {
            done = true;
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: [ERROR] ${message}\n\n`);
    res.end();
  }
}

// Generic endpoint — model specified in body
router.post("/chat", async (req: Request, res: Response) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.model) {
    res.status(400).json({ error: "Invalid request body — model is required" });
    return;
  }
  const { model, messages, systemPrompt } = parsed.data;
  await streamChat(model!, messages, systemPrompt, res);
});

// Dedicated endpoint per uncensored model — no model field needed in body
for (const [slug, modelId] of Object.entries(UNCENSORED_MODEL_ENDPOINTS)) {
  router.post(`/chat/${slug}`, async (req: Request, res: Response) => {
    const parsed = z.object({
      messages: z.array(ChatMessageSchema),
      systemPrompt: z.string().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { messages, systemPrompt } = parsed.data;
    await streamChat(modelId, messages, systemPrompt, res);
  });
}

// Discovery — list all dedicated uncensored endpoints
router.get("/chat/endpoints", (_req, res) => {
  const endpoints = Object.entries(UNCENSORED_MODEL_ENDPOINTS).map(([slug, modelId]) => ({
    slug,
    endpoint: `/api/chat/${slug}`,
    modelId,
  }));
  res.json({ endpoints });
});

export default router;
