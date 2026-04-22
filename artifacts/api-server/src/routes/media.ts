import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import OpenAI from "openai";

const router: IRouter = Router();

function getClient(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("AI integration not configured");
  return new OpenAI({ baseURL, apiKey });
}

const ImageGenSchema = z.object({
  prompt: z.string().min(1),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional(),
});

const REALISM_PREFIX =
  "Photorealistic, hyper-realistic photograph, shot on a high-end full-frame DSLR camera, " +
  "natural lighting, shallow depth of field, sharp focus, fine skin pore detail, " +
  "subtle imperfections, candid moment, documentary photography style. Subject: ";

router.post("/media/image", async (req: Request, res: Response) => {
  const parsed = ImageGenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  try {
    const client = getClient();
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt: REALISM_PREFIX + parsed.data.prompt,
      size: parsed.data.size ?? "1024x1024",
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      res.status(500).json({ error: "No image returned" });
      return;
    }
    res.json({ b64_json: b64, dataUrl: `data:image/png;base64,${b64}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[media] image gen error:", msg);
    res.status(500).json({ error: msg });
  }
});

const VisionSchema = z.object({
  prompt: z.string().min(1),
  imageDataUrls: z.array(z.string()).min(1),
});

router.post("/media/vision", async (req: Request, res: Response) => {
  const parsed = VisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "prompt and imageDataUrls required" });
    return;
  }
  try {
    const client = getClient();
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: parsed.data.prompt }];
    for (const url of parsed.data.imageDataUrls) {
      content.push({ type: "image_url", image_url: { url } });
    }
    const completion = await client.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4096,
      messages: [{ role: "user", content }],
    });
    res.json({ analysis: completion.choices[0]?.message?.content ?? "" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[media] vision error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
