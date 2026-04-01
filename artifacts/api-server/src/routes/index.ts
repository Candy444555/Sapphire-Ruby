import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import chatRouter from "./chat";
import terminalRouter from "./terminal";

const router: IRouter = Router();

router.use(modelsRouter);
router.use(chatRouter);
router.use(healthRouter);
router.use(terminalRouter);

export default router;
