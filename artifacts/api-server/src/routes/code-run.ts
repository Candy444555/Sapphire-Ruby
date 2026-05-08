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

export type RunResult = {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
};

export type SupportedLanguage = LangKey;
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = Object.keys(LANGUAGES) as SupportedLanguage[];

/**
 * Run a code snippet in the local sandbox. Used by both the public /code/run
 * endpoint and the code-craft self-test loop. Snippet is written to a temp
 * file under SCRATCH_DIR, executed with a hard timeout, then deleted.
 */
export async function runCodeSandbox(
  language: SupportedLanguage,
  code: string,
  opts: { stdin?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  const conf = LANGUAGES[language];
  const id = randomUUID();
  const filePath = join(SCRATCH_DIR, `${id}.${conf.ext}`);
  writeFileSync(filePath, code, "utf8");

  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  return await new Promise<RunResult>((resolve) => {
    let resolved = false;
    const finish = (r: RunResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { unlinkSync(filePath); } catch {}
      resolve(r);
    };
    const child = spawn(conf.cmd, conf.args(filePath), { cwd: SCRATCH_DIR });
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch {}
    }, opts.timeoutMs ?? 15000);
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    try {
      if (opts.stdin) child.stdin.write(opts.stdin);
      child.stdin.end();
    } catch {}
    child.on("close", (exitCode) => {
      finish({
        ok: !timedOut && exitCode === 0,
        exitCode,
        timedOut,
        durationMs: Date.now() - start,
        stdout: stdout.slice(-50_000),
        stderr: stderr.slice(-50_000),
      });
    });
    child.on("error", (err) => {
      finish({
        ok: false,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - start,
        stdout,
        stderr,
        error: err.message,
      });
    });
  });
}

router.post("/code/run", async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "language and code required" });
    return;
  }
  const { language, code, stdin, timeoutMs } = parsed.data;
  const result = await runCodeSandbox(language as SupportedLanguage, code, { stdin, timeoutMs });
  res.status(result.error ? 500 : 200).json(result);
});

export default router;
