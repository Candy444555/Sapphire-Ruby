import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MODELS = [
  {
    id: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
    name: "Lexi Uncensored V2 8B",
    description: "Llama 3.1 8B fine-tune with all censorship and restrictions removed",
    uncensored: true,
  },
];

router.get("/models", (_req, res) => {
  res.json({ models: MODELS });
});

export default router;
