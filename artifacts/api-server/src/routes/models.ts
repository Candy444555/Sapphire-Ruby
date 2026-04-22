import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  {
    id: "lexi-uncensored-v2-8b",
    name: "Lexi Uncensored v2",
    description: "Llama 3.1 8B Lexi Uncensored v2 — fully uncensored, no content restrictions",
    uncensored: true,
  },
  {
    id: "hermes-3-llama-3.1-8b",
    name: "Hermes 3 Llama 8B",
    description: "Nous Research Hermes 3 8B — uncensored, strong reasoning",
    uncensored: true,
  },
  {
    id: "mythomax-l2-13b",
    name: "MythoMax 13B",
    description: "Gryphe MythoMax L2 13B — uncensored creative writing",
    uncensored: true,
  },
  {
    id: "llama-3.1-8b-instruct",
    name: "Llama 3.1 8B",
    description: "Meta Llama 3.1 8B Instruct — official model",
    uncensored: false,
  },
  {
    id: "mistral-7b-instruct",
    name: "Mistral 7B",
    description: "Mistral 7B Instruct v0.3 — official model",
    uncensored: false,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
