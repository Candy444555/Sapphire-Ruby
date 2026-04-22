import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const SCRATCH_DIR = "/tmp/lexi-coderun";
mkdirSync(SCRATCH_DIR, { recursive: true });

const LANGUAGES = {
  python: { ext: "py", cmd: "python3", args: (f: string) => [f] },
  javascript: { ext: "js", cmd: "node", args: (f: string) => [f] },
  typescript: { ext: "ts", cmd: "npx", args: (f: string) => ["-y", "tsx", f] },
  bash: { ext: "sh", cmd: "bash", args: (f: string) => [f] },
  ruby: { ext: "rb", cmd: "ruby", args: (f: string) => [f] },
  go: { ext: "go", cmd: "go", args: (f: string) => ["run", f] },
} as const;

type LangKey = keyof typeof LANGUAGES;

const RunSchema = z.object({
  language: z.enum(["python", "javascript", "typescript", "bash", "ruby", "go"]),
  code: z.string().min(1),
  stdin: z.string().optional(),
  timeoutMs: z.number().int().positive().max(30000).optional(),
});

router.post("/code/run", async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "language and code required" });
    return;
  }
  const { language, code, stdin, timeoutMs } = parsed.data;
  const conf = LANGUAGES[language as LangKey];
  const id = randomUUID();
  const filePath = join(SCRATCH_DIR, `${id}.${conf.ext}`);
  writeFileSync(filePath, code, "utf8");

  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let responded = false;

  await new Promise<void>((resolve) => {
    const child = spawn(conf.cmd, conf.args(filePath), { cwd: SCRATCH_DIR });
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch {}
    }, timeoutMs ?? 15000);
    const finish = (payload: Record<string, unknown>, status = 200) => {
      if (responded) return;
      responded = true;
      clearTimeout(timer);
      try { unlinkSync(filePath); } catch {}
      res.status(status).json(payload);
      resolve();
    };
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    try {
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    } catch {}
    child.on("close", (code) => {
      finish({
        ok: !timedOut && code === 0,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
        stdout: stdout.slice(-50_000),
        stderr: stderr.slice(-50_000),
      });
    });
    child.on("error", (err) => {
      finish({ ok: false, error: err.message, stdout, stderr }, 500);
    });
  });
});

export default router;
