import { Router, type IRouter } from "express";

const router: IRouter = Router();

const FEATHERLESS_MODELS = [
  {
    id: "cognitivecomputations/Dolphin3.0-Llama3.1-8B",
    name: "Dolphin 3.0 Llama 3.1 8B",
    description: "Cognitive Computations Dolphin — fully abliterated, no restrictions, no refusals",
    uncensored: true,
    provider: "featherless",
  },
  {
    id: "cognitivecomputations/dolphin-2.9.3-mistral-nemo-12b",
    name: "Dolphin 2.9.3 Mistral Nemo 12B",
    description: "Dolphin on Mistral Nemo — uncensored and highly capable",
    uncensored: true,
    provider: "featherless",
  },
  {
    id: "NousResearch/Hermes-3-Llama-3.1-70B",
    name: "Hermes 3 Llama 3.1 70B",
    description: "Nous Research Hermes 3 — powerful instruction-following, no filters",
    uncensored: true,
    provider: "featherless",
  },
  {
    id: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B Instruct",
    description: "Meta Llama 3.3 70B — top-tier open model",
    uncensored: false,
    provider: "featherless",
  },
];

const OPENROUTER_MODELS = [
  {
    id: "dolphin-uncensored-24b",
    name: "Dolphin Mistral 24B",
    description: "Cognitive Computations Dolphin — fully abliterated, zero restrictions, zero refusals",
    uncensored: true,
    provider: "openrouter",
  },
];

router.get("/models", (_req, res) => {
  const useFeatherless = !!process.env.FEATHERLESS_API_KEY;
  const models = useFeatherless ? FEATHERLESS_MODELS : OPENROUTER_MODELS;
  res.json({ models, provider: useFeatherless ? "featherless" : "openrouter" });
});

export default router;
