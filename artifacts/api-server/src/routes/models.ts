import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  // --- UNCENSORED MODELS ---
  {
    id: "nousresearch/hermes-4-405b",
    name: "Hermes 4 405B",
    description: "Nous Research's most powerful uncensored model — latest generation",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-4-70b",
    name: "Hermes 4 70B",
    description: "Fast and capable uncensored Hermes 4 model",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b",
    name: "Hermes 3 Llama 3.1 405B",
    description: "Nous Research flagship uncensored model on Llama 3.1 405B",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    name: "Hermes 3 Llama 3.1 405B (Free)",
    description: "Free tier — powerful uncensored 405B model",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 Llama 3.1 70B",
    description: "Nous Research uncensored 70B, strong instruction following",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-2-pro-llama-3-8b",
    name: "Hermes 2 Pro Llama 3 8B",
    description: "Fast uncensored 8B model, great for quick tasks",
    uncensored: true,
  },
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    name: "Dolphin Mistral 24B Venice (Free)",
    description: "Free uncensored Dolphin fine-tune on Mistral 24B — Venice edition",
    uncensored: true,
  },
  {
    id: "sao10k/l3.3-euryale-70b",
    name: "Euryale v2.3 70B",
    description: "Latest Euryale — top uncensored model for creative writing and roleplay",
    uncensored: true,
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Euryale v2.2 70B",
    description: "Uncensored creative and roleplay focused Llama 3.1 70B fine-tune",
    uncensored: true,
  },
  {
    id: "sao10k/l3-euryale-70b",
    name: "Euryale v2.1 70B",
    description: "Uncensored roleplay Llama 3 70B fine-tune",
    uncensored: true,
  },
  {
    id: "anthracite-org/magnum-v4-72b",
    name: "Magnum v4 72B",
    description: "High-quality uncensored creative and reasoning model",
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
    description: "Uncensored roleplay model using SLERP merge technique",
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
