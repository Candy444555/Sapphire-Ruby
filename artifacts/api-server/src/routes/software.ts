import { Router, type Request, type Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

const CATALOG = [
  {
    category: "Languages",
    icon: "code",
    items: [
      { id: "python3", name: "Python 3", check: "python3 --version", install: "apt-get install -y python3 python3-pip python3-venv", version_cmd: "python3 --version" },
      { id: "nodejs", name: "Node.js", check: "node --version", install: "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs", version_cmd: "node --version" },
      { id: "golang", name: "Go", check: "go version", install: "apt-get install -y golang", version_cmd: "go version" },
      { id: "rust", name: "Rust", check: "rustc --version", install: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env", version_cmd: "rustc --version" },
      { id: "ruby", name: "Ruby", check: "ruby --version", install: "apt-get install -y ruby ruby-dev", version_cmd: "ruby --version" },
      { id: "java", name: "Java (JDK 17)", check: "java -version", install: "apt-get install -y default-jdk", version_cmd: "java -version 2>&1 | head -1" },
      { id: "php", name: "PHP", check: "php --version", install: "apt-get install -y php php-cli php-common", version_cmd: "php --version | head -1" },
      { id: "perl", name: "Perl", check: "perl --version", install: "apt-get install -y perl", version_cmd: "perl --version | head -2 | tail -1" },
      { id: "swift", name: "Swift", check: "swift --version", install: "apt-get install -y swift", version_cmd: "swift --version" },
      { id: "kotlin", name: "Kotlin", check: "kotlinc -version", install: "apt-get install -y kotlin", version_cmd: "kotlinc -version 2>&1" },
    ],
  },
  {
    category: "Package Managers",
    icon: "package",
    items: [
      { id: "pip", name: "pip (Python)", check: "pip3 --version", install: "apt-get install -y python3-pip", version_cmd: "pip3 --version" },
      { id: "npm", name: "npm", check: "npm --version", install: "apt-get install -y npm", version_cmd: "npm --version" },
      { id: "yarn", name: "Yarn", check: "yarn --version", install: "npm install -g yarn", version_cmd: "yarn --version" },
      { id: "pnpm", name: "pnpm", check: "pnpm --version", install: "npm install -g pnpm", version_cmd: "pnpm --version" },
      { id: "cargo", name: "Cargo (Rust)", check: "cargo --version", install: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env", version_cmd: "cargo --version" },
      { id: "gem", name: "RubyGems", check: "gem --version", install: "apt-get install -y rubygems", version_cmd: "gem --version" },
      { id: "composer", name: "Composer (PHP)", check: "composer --version", install: "curl -sS https://getcomposer.org/installer | php && mv composer.phar /usr/local/bin/composer", version_cmd: "composer --version" },
    ],
  },
  {
    category: "Dev Tools",
    icon: "tool",
    items: [
      { id: "git", name: "Git", check: "git --version", install: "apt-get install -y git", version_cmd: "git --version" },
      { id: "curl", name: "curl", check: "curl --version", install: "apt-get install -y curl", version_cmd: "curl --version | head -1" },
      { id: "wget", name: "wget", check: "wget --version", install: "apt-get install -y wget", version_cmd: "wget --version | head -1" },
      { id: "vim", name: "Vim", check: "vim --version", install: "apt-get install -y vim", version_cmd: "vim --version | head -1" },
      { id: "nano", name: "nano", check: "nano --version", install: "apt-get install -y nano", version_cmd: "nano --version" },
      { id: "make", name: "Make", check: "make --version", install: "apt-get install -y make", version_cmd: "make --version | head -1" },
      { id: "cmake", name: "CMake", check: "cmake --version", install: "apt-get install -y cmake", version_cmd: "cmake --version | head -1" },
      { id: "gcc", name: "GCC (C/C++)", check: "gcc --version", install: "apt-get install -y gcc g++", version_cmd: "gcc --version | head -1" },
      { id: "docker", name: "Docker CLI", check: "docker --version", install: "apt-get install -y docker.io", version_cmd: "docker --version" },
      { id: "jq", name: "jq (JSON)", check: "jq --version", install: "apt-get install -y jq", version_cmd: "jq --version" },
      { id: "ffmpeg", name: "FFmpeg", check: "ffmpeg -version", install: "apt-get install -y ffmpeg", version_cmd: "ffmpeg -version 2>&1 | head -1" },
      { id: "imagemagick", name: "ImageMagick", check: "convert --version", install: "apt-get install -y imagemagick", version_cmd: "convert --version | head -1" },
    ],
  },
  {
    category: "Security Tools",
    icon: "shield",
    items: [
      { id: "nmap", name: "nmap", check: "nmap --version", install: "apt-get install -y nmap", version_cmd: "nmap --version | head -1" },
      { id: "netcat", name: "netcat", check: "nc -h", install: "apt-get install -y netcat-openbsd", version_cmd: "nc -h 2>&1 | head -1" },
      { id: "hydra", name: "Hydra", check: "hydra -h", install: "apt-get install -y hydra", version_cmd: "hydra -h 2>&1 | head -1" },
      { id: "sqlmap", name: "sqlmap", check: "sqlmap --version", install: "apt-get install -y sqlmap", version_cmd: "sqlmap --version 2>&1 | head -1" },
      { id: "metasploit", name: "Metasploit", check: "msfconsole --version", install: "apt-get install -y metasploit-framework", version_cmd: "msfconsole --version 2>&1" },
      { id: "hashcat", name: "Hashcat", check: "hashcat --version", install: "apt-get install -y hashcat", version_cmd: "hashcat --version" },
      { id: "john", name: "John the Ripper", check: "john --version", install: "apt-get install -y john", version_cmd: "john --version 2>&1" },
      { id: "aircrack", name: "Aircrack-ng", check: "aircrack-ng --help", install: "apt-get install -y aircrack-ng", version_cmd: "aircrack-ng --version 2>&1 | head -1" },
      { id: "wireshark", name: "Wireshark/tshark", check: "tshark --version", install: "apt-get install -y tshark", version_cmd: "tshark --version | head -1" },
      { id: "gobuster", name: "Gobuster", check: "gobuster version", install: "apt-get install -y gobuster", version_cmd: "gobuster version" },
    ],
  },
  {
    category: "Databases",
    icon: "database",
    items: [
      { id: "sqlite3", name: "SQLite 3", check: "sqlite3 --version", install: "apt-get install -y sqlite3", version_cmd: "sqlite3 --version" },
      { id: "postgresql", name: "PostgreSQL client", check: "psql --version", install: "apt-get install -y postgresql-client", version_cmd: "psql --version" },
      { id: "mysql-client", name: "MySQL client", check: "mysql --version", install: "apt-get install -y default-mysql-client", version_cmd: "mysql --version" },
      { id: "redis-cli", name: "Redis CLI", check: "redis-cli --version", install: "apt-get install -y redis-tools", version_cmd: "redis-cli --version" },
      { id: "mongodb-tools", name: "MongoDB tools", check: "mongosh --version", install: "apt-get install -y mongodb-clients", version_cmd: "mongosh --version 2>/dev/null || mongo --version 2>/dev/null | head -1" },
    ],
  },
  {
    category: "Web & Network",
    icon: "globe",
    items: [
      { id: "nginx", name: "nginx", check: "nginx -v", install: "apt-get install -y nginx", version_cmd: "nginx -v 2>&1" },
      { id: "apache2", name: "Apache 2", check: "apache2 -v", install: "apt-get install -y apache2", version_cmd: "apache2 -v 2>&1 | head -1" },
      { id: "httpie", name: "HTTPie", check: "http --version", install: "pip3 install httpie", version_cmd: "http --version" },
      { id: "socat", name: "socat", check: "socat -V", install: "apt-get install -y socat", version_cmd: "socat -V 2>&1 | head -1" },
      { id: "tor", name: "Tor", check: "tor --version", install: "apt-get install -y tor", version_cmd: "tor --version | head -1" },
      { id: "proxychains", name: "proxychains", check: "proxychains4 -h", install: "apt-get install -y proxychains4", version_cmd: "proxychains4 -h 2>&1 | head -1" },
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

// GET /api/software/catalog — list all software
router.get("/software/catalog", (_req: Request, res: Response) => {
  res.json({ catalog: CATALOG });
});

// POST /api/software/status — check if a list of tools are installed
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

// POST /api/software/install — install a package by ID or custom command
router.post("/software/install", async (req: Request, res: Response) => {
  const { id, customCommand } = req.body as { id?: string; customCommand?: string };

  let installCmd: string;
  let itemName = id ?? "custom";

  if (customCommand) {
    installCmd = customCommand;
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
    const env = { ...process.env, DEBIAN_FRONTEND: "noninteractive", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.cargo/bin" };
    const { stdout, stderr } = await execAsync(installCmd, {
      timeout: 120_000,
      env,
    });
    const output = `${stdout}\n${stderr}`.trim();
    res.json({ ok: true, name: itemName, output: output.slice(0, 4000) });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      name: itemName,
      error: err.message?.slice(0, 400),
      output: (err.stdout ?? "").slice(0, 2000),
    });
  }
});

export default router;
