import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(modelsRouter);
router.use(chatRouter);
router.use(healthRouter);

export default router;
