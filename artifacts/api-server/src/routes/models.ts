import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  // --- UNCENSORED MODELS ---
  {
    id: "NousResearch/Hermes-3-Llama-3.1-405B",
    name: "Hermes 3 Llama 3.1 405B",
    description: "Nous Research flagship uncensored model on Llama 3.1 405B",
    uncensored: true,
  },
  {
    id: "NousResearch/Hermes-3-Llama-3.1-70B",
    name: "Hermes 3 Llama 3.1 70B",
    description: "Uncensored 70B with strong instruction following",
    uncensored: true,
  },
  {
    id: "NousResearch/Hermes-2-Pro-Llama-3-8B",
    name: "Hermes 2 Pro Llama 3 8B",
    description: "Fast uncensored 8B model, ideal for quick tasks",
    uncensored: true,
  },
  {
    id: "sao10k/L3.3-Euryale-70B",
    name: "Euryale v2.3 70B",
    description: "Best uncensored model for creative writing, roleplay and adult content",
    uncensored: true,
  },
  {
    id: "sao10k/L3.1-Euryale-70B",
    name: "Euryale v2.2 70B",
    description: "Uncensored creative and roleplay Llama 3.1 70B fine-tune",
    uncensored: true,
  },
  {
    id: "sao10k/L3-Euryale-70B",
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
    id: "Gryphe/MythoMax-L2-13b",
    name: "MythoMax L2 13B",
    description: "Classic uncensored model blending multiple fine-tunes",
    uncensored: true,
  },
  {
    id: "Undi95/ReMM-SLERP-L2-13b",
    name: "ReMM SLERP L2 13B",
    description: "Uncensored roleplay model using SLERP merge technique",
    uncensored: true,
  },

  // --- STANDARD MODELS ---
  {
    id: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B Instruct",
    description: "Meta's latest open-source instruction-tuned model",
    uncensored: false,
  },
  {
    id: "Qwen/Qwen2.5-72B-Instruct",
    name: "Qwen 2.5 72B Instruct",
    description: "Alibaba's powerful 72B instruction-tuned model",
    uncensored: false,
  },
  {
    id: "mistralai/Mistral-Large-Instruct-2411",
    name: "Mistral Large",
    description: "Mistral AI's top-tier instruction model",
    uncensored: false,
  },
  {
    id: "deepseek-ai/DeepSeek-V3",
    name: "DeepSeek V3",
    description: "DeepSeek's powerful conversational model",
    uncensored: false,
  },
  {
    id: "google/gemma-2-27b-it",
    name: "Gemma 2 27B",
    description: "Google's open instruction-tuned Gemma 2 model",
    uncensored: false,
  },
  {
    id: "microsoft/Phi-4",
    name: "Phi-4 14B",
    description: "Microsoft's compact yet highly capable model",
    uncensored: false,
  },
  {
    id: "Qwen/Qwen2.5-7B-Instruct",
    name: "Qwen 2.5 7B Instruct",
    description: "Fast and efficient 7B instruction model",
    uncensored: false,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
