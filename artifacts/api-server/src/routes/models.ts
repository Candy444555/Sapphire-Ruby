import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  {
    id: "cognitivecomputations/dolphin3.0-mistral-24b:free",
    name: "Dolphin 3.0 Mistral 24B",
    description: "Uncensored model fine-tuned for helpfulness without restrictions",
    uncensored: true,
  },
  {
    id: "cognitivecomputations/dolphin-mixtral-8x22b",
    name: "Dolphin Mixtral 8x22B",
    description: "Powerful uncensored Mixtral model by Cognitive Computations",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b",
    name: "Hermes 3 Llama 3.1 405B",
    description: "Nous Research's top uncensored model based on Llama 3.1 405B",
    uncensored: true,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 Llama 3.1 70B",
    description: "Nous Research uncensored Llama 3.1 70B variant",
    uncensored: true,
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Euryale v2.2 70B",
    description: "Uncensored creative writing and roleplay focused model",
    uncensored: true,
  },
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
