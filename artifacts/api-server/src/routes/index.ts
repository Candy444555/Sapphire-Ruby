import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import chatRouter from "./chat";
import agentRouter from "./agent";
import terminalRouter from "./terminal";
import phoneRouter from "./phone";
import sshRouter from "./ssh";
import vpnRouter from "./vpn";
import selfPatchRouter from "./self-patch";
import projectsRouter from "./projects";
import uploadRouter from "./upload";
import githubRouter from "./github";
import githubBuildApkRouter from "./github-build-apk";
import softwareRouter from "./software";

const router: IRouter = Router();

router.use(vpnRouter);
router.use(modelsRouter);
router.use(chatRouter);
router.use(agentRouter);
router.use(healthRouter);
router.use(terminalRouter);
router.use(sshRouter);
router.use(phoneRouter);
router.use(selfPatchRouter);
router.use(projectsRouter);
router.use(uploadRouter);
router.use(githubRouter);
router.use(githubBuildApkRouter);
router.use(softwareRouter);

export default router;
