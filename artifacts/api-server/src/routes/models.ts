import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  // --- UNCENSORED MODELS ---
  {
    id: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
    name: "Lexi Uncensored V2 8B",
    description: "Llama 3.1 8B fine-tune with all censorship and restrictions removed",
    uncensored: true,
  },
  {
    id: "NousResearch/Hermes-2-Pro-Llama-3-8B",
    name: "Hermes 2 Pro 8B",
    description: "Fast uncensored 8B model with strong instruction following",
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
    id: "deepseek-ai/DeepSeek-V3",
    name: "DeepSeek V3",
    description: "DeepSeek's powerful conversational model",
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
