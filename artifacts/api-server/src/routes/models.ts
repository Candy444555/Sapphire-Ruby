import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  {
    id: "qwen-uncensored-7b",
    name: "Qwen 2.5 7B Uncensored",
    description: "Qwen 2.5 7B with all refusals and restrictions abliterated — fully uncensored",
    uncensored: true,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
