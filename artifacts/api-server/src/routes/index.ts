import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import chatRouter from "./chat";
import terminalRouter from "./terminal";
import phoneRouter from "./phone";

const router: IRouter = Router();

router.use(modelsRouter);
router.use(chatRouter);
router.use(healthRouter);
router.use(terminalRouter);
router.use(phoneRouter);

export default router;
