import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  {
    id: "lexi-uncensored-v2-8b",
    name: "Lexi Uncensored (Dolphin Nemo 12B)",
    description: "Mistral Nemo 12B Dolphin 2.9.3 fine-tune with all censorship and restrictions removed",
    uncensored: true,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
