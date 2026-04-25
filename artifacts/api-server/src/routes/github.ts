import { Router, type Request, type Response } from "express";

const router = Router();

const GITHUB_API = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return token;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Lexi-App/1.0",
  };
}

async function githubFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  return res.json();
}

// GET /api/github/user — authenticated user info
router.get("/github/user", async (_req: Request, res: Response) => {
  try {
    const data = await githubFetch("/user");
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github/repos — list user repos
router.get("/github/repos", async (req: Request, res: Response) => {
  try {
    const per_page = req.query.per_page ?? "50";
    const page = req.query.page ?? "1";
    const sort = req.query.sort ?? "updated";
    const data = await githubFetch(
      `/user/repos?per_page=${per_page}&page=${page}&sort=${sort}&affiliation=owner,collaborator`
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github/repos/:owner/:repo — repo details
router.get("/github/repos/:owner/:repo", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubFetch(`/repos/${owner}/${repo}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github/repos/:owner/:repo/branches — list branches
router.get("/github/repos/:owner/:repo/branches", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=50`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github/repos/:owner/:repo/tree — file tree (recursive)
router.get("/github/repos/:owner/:repo/tree", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const branch = (req.query.branch as string) || "main";
    const data = await githubFetch(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    res.json(data);
  } catch (err: any) {
    // Try master if main fails
    try {
      const { owner, repo } = req.params;
      const data = await githubFetch(
        `/repos/${owner}/${repo}/git/trees/master?recursive=1`
      );
      res.json(data);
    } catch (err2: any) {
      res.status(500).json({ error: err2.message });
    }
  }
});

// GET /api/github/repos/:owner/:repo/contents — file contents
router.get("/github/repos/:owner/:repo/contents", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const filePath = (req.query.path as string) ?? "";
    const ref = (req.query.ref as string) ?? "";
    const refParam = ref ? `?ref=${ref}` : "";
    const data = await githubFetch(
      `/repos/${owner}/${repo}/contents/${filePath}${refParam}`
    );
    if (Array.isArray(data)) {
      res.json(data);
    } else {
      const content = data.content
        ? Buffer.from(data.content, "base64").toString("utf-8")
        : "";
      res.json({ ...data, decoded_content: content });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/github/repos/:owner/:repo/push — create or update a file (commit)
router.post("/github/repos/:owner/:repo/push", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const { path: filePath, content, message, branch, sha } = req.body;

    if (!filePath || content === undefined || !message) {
      res.status(400).json({ error: "path, content, and message are required" });
      return;
    }

    const encoded = Buffer.from(content, "utf-8").toString("base64");
    const body: Record<string, string> = { message, content: encoded };
    if (branch) body.branch = branch;
    if (sha) body.sha = sha;

    const data = await githubFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    res.json({ ok: true, commit: data.commit?.sha, url: data.content?.html_url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/github/repos/:owner/:repo/push-multi — push multiple files in sequence
router.post("/github/repos/:owner/:repo/push-multi", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const { files, branch } = req.body as {
      files: Array<{ path: string; content: string }>;
      branch?: string;
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "files array is required" });
      return;
    }

    const results: Array<{ path: string; url: string; sha: string }> = [];

    for (const file of files) {
      const encoded = Buffer.from(file.content, "utf-8").toString("base64");

      // Check if file exists to get SHA for update
      let sha: string | undefined;
      try {
        const existing = await githubFetch(
          `/repos/${owner}/${repo}/contents/${file.path}${branch ? `?ref=${branch}` : ""}`
        );
        sha = existing.sha;
      } catch {}

      const body: Record<string, string> = {
        message: `feat: add ${file.path} via Lexi`,
        content: encoded,
      };
      if (branch) body.branch = branch;
      if (sha) body.sha = sha;

      const data = await githubFetch(`/repos/${owner}/${repo}/contents/${file.path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      results.push({
        path: file.path,
        url: data.content?.html_url ?? "",
        sha: data.commit?.sha ?? "",
      });
    }

    res.json({ ok: true, pushed: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/github/repos/:owner/:repo/issues — create issue
router.post("/github/repos/:owner/:repo/issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const { title, body, labels } = req.body;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const data = await githubFetch(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body: body ?? "", labels: labels ?? [] }),
    });

    res.json({ ok: true, number: data.number, url: data.html_url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github/repos/:owner/:repo/issues — list issues
router.get("/github/repos/:owner/:repo/issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const state = (req.query.state as string) ?? "open";
    const data = await githubFetch(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=30`
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/github/repos — create a new repository
router.post("/github/repos", async (req: Request, res: Response) => {
  try {
    const { name, description, private: isPrivate, auto_init } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const data = await githubFetch("/user/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description ?? "",
        private: isPrivate ?? false,
        auto_init: auto_init ?? true,
      }),
    });
    res.json({ ok: true, full_name: data.full_name, url: data.html_url, clone_url: data.clone_url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
