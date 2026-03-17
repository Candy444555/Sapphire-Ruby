import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  // --- UNCENSORED MODELS ---
  {
    id: "cognitivecomputations/dolphin3.0-mistral-24b:free",
    name: "Dolphin 3.0 Mistral 24B (Free)",
    description: "Free uncensored Dolphin fine-tune on Mistral 24B",
    uncensored: true,
  },
  {
    id: "cognitivecomputations/dolphin3.0-r1-mistral-24b:free",
    name: "Dolphin 3.0 R1 Mistral 24B (Free)",
    description: "Reasoning-enhanced uncensored Dolphin on Mistral 24B",
    uncensored: true,
  },
  {
    id: "cognitivecomputations/dolphin-mixtral-8x22b",
    name: "Dolphin Mixtral 8x22B",
    description: "Powerful uncensored Mixtral MoE model by Cognitive Computations",
    uncensored: true,
  },
  {
    id: "cognitivecomputations/dolphin-mixtral-8x7b",
    name: "Dolphin Mixtral 8x7B",
    description: "Uncensored Mixtral 8x7B fine-tune, great balance of speed and quality",
    uncensored: true,
  },
  {
    id: "cognitivecomputations/dolphin-llama-3-70b",
    name: "Dolphin Llama 3 70B",
    description: "Uncensored Llama 3 70B fine-tune by Cognitive Computations",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b",
    name: "Hermes 3 Llama 3.1 405B",
    description: "Nous Research's flagship uncensored model on Llama 3.1 405B",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 Llama 3.1 70B",
    description: "Nous Research uncensored 70B variant with strong instruction following",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-2-pro-llama-3-8b",
    name: "Hermes 2 Pro Llama 3 8B",
    description: "Fast uncensored 8B model, great for quick tasks",
    uncensored: true,
  },
  {
    id: "nousresearch/nous-hermes-2-mixtral-8x7b-dpo",
    name: "Nous Hermes 2 Mixtral 8x7B DPO",
    description: "DPO-trained uncensored Mixtral fine-tune by Nous Research",
    uncensored: true,
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Euryale v2.2 70B",
    description: "Top uncensored model for creative writing, roleplay and NSFW content",
    uncensored: true,
  },
  {
    id: "sao10k/l3-euryale-70b",
    name: "Euryale v2.1 70B",
    description: "Creative roleplay-focused uncensored Llama 3 70B fine-tune",
    uncensored: true,
  },
  {
    id: "sao10k/l3.3-euryale-70b",
    name: "Euryale v2.3 70B",
    description: "Latest Euryale uncensored model based on Llama 3.3 70B",
    uncensored: true,
  },
  {
    id: "anthracite-org/magnum-v4-72b",
    name: "Magnum v4 72B",
    description: "Uncensored high-quality creative and reasoning model",
    uncensored: true,
  },
  {
    id: "anthracite-org/magnum-v2-72b",
    name: "Magnum v2 72B",
    description: "Anthropic-grade quality creative writing without restrictions",
    uncensored: true,
  },
  {
    id: "pygmalionai/mythalion-13b",
    name: "Mythalion 13B",
    description: "Uncensored roleplay and storytelling model by PygmalionAI",
    uncensored: true,
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax L2 13B",
    description: "Classic uncensored model blending multiple fine-tunes",
    uncensored: true,
  },
  {
    id: "undi95/remm-slerp-l2-13b",
    name: "ReMM SLERP L2 13B",
    description: "Uncensored roleplay model with SLERP merge technique",
    uncensored: true,
  },
  {
    id: "lizpreciatior/lzlv-70b-fp16-hf",
    name: "LZLV 70B",
    description: "Uncensored 70B model optimized for creative and adult content",
    uncensored: true,
  },

  // --- STANDARD MODELS ---
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    description: "OpenAI's flagship multimodal model",
    uncensored: false,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "OpenAI's fast and affordable GPT-4o variant",
    uncensored: false,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    description: "Anthropic's most intelligent model",
    uncensored: false,
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    description: "Google's fast and capable Gemini model",
    uncensored: false,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    description: "Meta's latest open-source instruction-tuned model",
    uncensored: false,
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    description: "Mistral AI's top-tier model",
    uncensored: false,
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat V3",
    description: "DeepSeek's powerful conversational model",
    uncensored: false,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
