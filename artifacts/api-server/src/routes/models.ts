import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  {
    id: "dolphin-uncensored-24b",
    name: "Dolphin Mistral 24B",
    description: "Cognitive Computations Dolphin — fully abliterated, zero restrictions, zero refusals",
    uncensored: true,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
