import { Router, type Request, type Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

const nix = (attr: string) => `nix-env -iA nixpkgs.${attr}`;

const CATALOG = [
  {
    category: "Languages",
    icon: "code",
    items: [
      { id: "python3", name: "Python 3", check: "python3 --version", install: nix("python311"), version_cmd: "python3 --version" },
      { id: "nodejs", name: "Node.js", check: "node --version", install: nix("nodejs_20"), version_cmd: "node --version" },
      { id: "golang", name: "Go", check: "go version", install: nix("go"), version_cmd: "go version" },
      { id: "rust", name: "Rust", check: "rustc --version", install: nix("rustc"), version_cmd: "rustc --version" },
      { id: "ruby", name: "Ruby", check: "ruby --version", install: nix("ruby"), version_cmd: "ruby --version" },
      { id: "java", name: "Java (JDK 17)", check: "java -version", install: nix("jdk17"), version_cmd: "java -version 2>&1 | head -1" },
      { id: "php", name: "PHP", check: "php --version", install: nix("php"), version_cmd: "php --version | head -1" },
      { id: "perl", name: "Perl", check: "perl --version", install: nix("perl"), version_cmd: "perl --version | head -2 | tail -1" },
      { id: "lua", name: "Lua", check: "lua -v", install: nix("lua"), version_cmd: "lua -v 2>&1" },
      { id: "kotlin", name: "Kotlin", check: "kotlinc -version", install: nix("kotlin"), version_cmd: "kotlinc -version 2>&1" },
    ],
  },
  {
    category: "Package Managers",
    icon: "package",
    items: [
      { id: "pip", name: "pip (Python)", check: "pip3 --version", install: nix("python311Packages.pip"), version_cmd: "pip3 --version" },
      { id: "npm", name: "npm", check: "npm --version", install: nix("nodejs_20"), version_cmd: "npm --version" },
      { id: "yarn", name: "Yarn", check: "yarn --version", install: nix("yarn"), version_cmd: "yarn --version" },
      { id: "pnpm", name: "pnpm", check: "pnpm --version", install: nix("nodePackages.pnpm"), version_cmd: "pnpm --version" },
      { id: "cargo", name: "Cargo (Rust)", check: "cargo --version", install: nix("cargo"), version_cmd: "cargo --version" },
      { id: "gem", name: "RubyGems", check: "gem --version", install: nix("ruby"), version_cmd: "gem --version" },
      { id: "composer", name: "Composer (PHP)", check: "composer --version", install: nix("php83Packages.composer"), version_cmd: "composer --version" },
    ],
  },
  {
    category: "Dev Tools",
    icon: "tool",
    items: [
      { id: "git", name: "Git", check: "git --version", install: nix("git"), version_cmd: "git --version" },
      { id: "curl", name: "curl", check: "curl --version", install: nix("curl"), version_cmd: "curl --version | head -1" },
      { id: "wget", name: "wget", check: "wget --version", install: nix("wget"), version_cmd: "wget --version | head -1" },
      { id: "vim", name: "Vim", check: "vim --version", install: nix("vim"), version_cmd: "vim --version | head -1" },
      { id: "nano", name: "nano", check: "nano --version", install: nix("nano"), version_cmd: "nano --version" },
      { id: "make", name: "Make", check: "make --version", install: nix("gnumake"), version_cmd: "make --version | head -1" },
      { id: "cmake", name: "CMake", check: "cmake --version", install: nix("cmake"), version_cmd: "cmake --version | head -1" },
      { id: "gcc", name: "GCC (C/C++)", check: "gcc --version", install: nix("gcc"), version_cmd: "gcc --version | head -1" },
      { id: "jq", name: "jq (JSON)", check: "jq --version", install: nix("jq"), version_cmd: "jq --version" },
      { id: "ffmpeg", name: "FFmpeg", check: "ffmpeg -version", install: nix("ffmpeg"), version_cmd: "ffmpeg -version 2>&1 | head -1" },
      { id: "imagemagick", name: "ImageMagick", check: "convert --version", install: nix("imagemagick"), version_cmd: "convert --version | head -1" },
      { id: "ripgrep", name: "ripgrep", check: "rg --version", install: nix("ripgrep"), version_cmd: "rg --version | head -1" },
      { id: "htop", name: "htop", check: "htop --version", install: nix("htop"), version_cmd: "htop --version" },
    ],
  },
  {
    category: "Security Tools",
    icon: "shield",
    items: [
      { id: "nmap", name: "nmap", check: "nmap --version", install: nix("nmap"), version_cmd: "nmap --version | head -1" },
      { id: "netcat", name: "netcat", check: "nc -h", install: nix("netcat-openbsd"), version_cmd: "nc -h 2>&1 | head -1" },
      { id: "hydra", name: "Hydra", check: "hydra -h", install: nix("thc-hydra"), version_cmd: "hydra -h 2>&1 | head -1" },
      { id: "sqlmap", name: "sqlmap", check: "sqlmap --version", install: nix("sqlmap"), version_cmd: "sqlmap --version 2>&1 | head -1" },
      { id: "hashcat", name: "Hashcat", check: "hashcat --version", install: nix("hashcat"), version_cmd: "hashcat --version" },
      { id: "john", name: "John the Ripper", check: "john --version", install: nix("john"), version_cmd: "john --version 2>&1" },
      { id: "aircrack", name: "Aircrack-ng", check: "aircrack-ng --help", install: nix("aircrack-ng"), version_cmd: "aircrack-ng --help 2>&1 | head -1" },
      { id: "wireshark", name: "Wireshark/tshark", check: "tshark --version", install: nix("wireshark-cli"), version_cmd: "tshark --version | head -1" },
      { id: "gobuster", name: "Gobuster", check: "gobuster version", install: nix("gobuster"), version_cmd: "gobuster version" },
      { id: "nikto", name: "Nikto", check: "nikto -Version", install: nix("nikto"), version_cmd: "nikto -Version 2>&1 | head -1" },
    ],
  },
  {
    category: "Databases",
    icon: "database",
    items: [
      { id: "sqlite3", name: "SQLite 3", check: "sqlite3 --version", install: nix("sqlite"), version_cmd: "sqlite3 --version" },
      { id: "postgresql", name: "PostgreSQL client", check: "psql --version", install: nix("postgresql"), version_cmd: "psql --version" },
      { id: "mysql-client", name: "MySQL client", check: "mysql --version", install: nix("mariadb-client"), version_cmd: "mysql --version" },
      { id: "redis-cli", name: "Redis CLI", check: "redis-cli --version", install: nix("redis"), version_cmd: "redis-cli --version" },
    ],
  },
  {
    category: "Web & Network",
    icon: "globe",
    items: [
      { id: "nginx", name: "nginx", check: "nginx -v", install: nix("nginx"), version_cmd: "nginx -v 2>&1" },
      { id: "httpie", name: "HTTPie", check: "http --version", install: nix("httpie"), version_cmd: "http --version" },
      { id: "socat", name: "socat", check: "socat -V", install: nix("socat"), version_cmd: "socat -V 2>&1 | head -1" },
      { id: "tor", name: "Tor", check: "tor --version", install: nix("tor"), version_cmd: "tor --version | head -1" },
      { id: "proxychains", name: "proxychains", check: "proxychains4 -h", install: nix("proxychains-ng"), version_cmd: "proxychains4 -h 2>&1 | head -1" },
      { id: "openssh", name: "OpenSSH", check: "ssh -V", install: nix("openssh"), version_cmd: "ssh -V 2>&1" },
    ],
  },
];

async function checkInstalled(checkCmd: string): Promise<boolean> {
  try {
    await execAsync(checkCmd, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function getVersion(versionCmd: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(versionCmd, { timeout: 5000 });
    return (stdout || stderr).trim().slice(0, 80);
  } catch {
    return "";
  }
}

function rewriteCustom(cmd: string): string {
  let c = cmd.trim();
  c = c.replace(/^\s*sudo\s+/i, "");
  c = c.replace(/^\s*apt(-get)?\s+install\s+(-y\s+)?/i, "nix-env -iA nixpkgs.");
  c = c.replace(/^\s*brew\s+install\s+/i, "nix-env -iA nixpkgs.");
  c = c.replace(/^\s*yum\s+install\s+(-y\s+)?/i, "nix-env -iA nixpkgs.");
  return c;
}

router.get("/software/catalog", (_req: Request, res: Response) => {
  res.json({ catalog: CATALOG });
});

router.post("/software/status", async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: "ids array required" });
    return;
  }

  const allItems = CATALOG.flatMap((cat) => cat.items);
  const results: Record<string, { installed: boolean; version: string }> = {};

  await Promise.all(
    ids.map(async (id) => {
      const item = allItems.find((i) => i.id === id);
      if (!item) return;
      const installed = await checkInstalled(item.check);
      const version = installed ? await getVersion(item.version_cmd) : "";
      results[id] = { installed, version };
    })
  );

  res.json({ status: results });
});

router.post("/software/install", async (req: Request, res: Response) => {
  const { id, customCommand } = req.body as { id?: string; customCommand?: string };

  let installCmd: string;
  let itemName = id ?? "custom";

  if (customCommand) {
    installCmd = rewriteCustom(customCommand);
  } else if (id) {
    const allItems = CATALOG.flatMap((cat) => cat.items);
    const item = allItems.find((i) => i.id === id);
    if (!item) {
      res.status(404).json({ error: `Unknown software id: ${id}` });
      return;
    }
    installCmd = item.install;
    itemName = item.name;
  } else {
    res.status(400).json({ error: "id or customCommand required" });
    return;
  }

  try {
    const env = {
      ...process.env,
      NIXPKGS_ALLOW_UNFREE: "1",
      NIXPKGS_ALLOW_INSECURE: "1",
      PATH: `${process.env.HOME}/.nix-profile/bin:/nix/var/nix/profiles/default/bin:${process.env.PATH ?? ""}`,
    };
    const { stdout, stderr } = await execAsync(installCmd, {
      timeout: 300_000,
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = `${stdout}\n${stderr}`.trim();
    res.json({ ok: true, name: itemName, command: installCmd, output: output.slice(0, 6000) });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      name: itemName,
      command: installCmd,
      error: err.message?.slice(0, 600),
      output: ((err.stdout ?? "") + "\n" + (err.stderr ?? "")).slice(0, 4000),
    });
  }
});

export default router;
