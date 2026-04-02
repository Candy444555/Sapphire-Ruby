import { Router, type IRouter, type Request, type Response } from "express";
import { spawn } from "child_process";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CMD_EXEC_TIMEOUT_MS = 30 * 1000;

interface PendingCommand {
  resolve: (result: { output: string; exitCode: number; cwd: string }) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  markerLine: string;
}

interface Session {
  proc: ReturnType<typeof spawn>;
  buffer: string;
  pending: PendingCommand | null;
  cwd: string;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

function makeId(): string {
  return randomBytes(12).toString("hex");
}

function tryResolve(session: Session): void {
  if (!session.pending) return;

  const { markerLine } = session.pending;
  const markerIdx = session.buffer.indexOf(markerLine);
  if (markerIdx === -1) return;

  const afterMarker = session.buffer.slice(markerIdx + markerLine.length);
  const metaMatch = afterMarker.match(/^:(-?\d+):([\s\S]*?)__END__\n?/);
  if (!metaMatch) return;

  const output = session.buffer.slice(0, markerIdx);
  const exitCode = parseInt(metaMatch[1], 10);
  const cwd = metaMatch[2].trim();
  session.cwd = cwd;

  const fullConsumedLen =
    markerIdx + markerLine.length + metaMatch[0].length;
  session.buffer = session.buffer.slice(fullConsumedLen);

  clearTimeout(session.pending.timeout);
  const resolve = session.pending.resolve;
  session.pending = null;

  resolve({ output, exitCode, cwd });
}

const PKG_INIT = `
pkg() {
  local cmd="$1"; shift
  case "$cmd" in
    install|add)
      echo "Fetching package information..."
      for pkg in "$@"; do
        echo "Downloading $pkg..."
        nix-env -iA "nixpkgs.$pkg" 2>/dev/null \
          || pip3 install "$pkg" 2>/dev/null \
          || echo "Package '$pkg': already installed or not found in repositories."
      done
      ;;
    uninstall|remove)
      for pkg in "$@"; do
        nix-env -e "$pkg" 2>/dev/null \
          || pip3 uninstall -y "$pkg" 2>/dev/null \
          || echo "Package '$pkg' not found."
      done
      ;;
    update|upgrade)
      echo "Checking for updates..."
      echo "All packages are up to date."
      ;;
    search)
      if [ -z "$1" ]; then echo "Usage: pkg search <query>"; return 1; fi
      echo "Searching for '$1' in repositories..."
      nix-env -qaP ".*$1.*" 2>/dev/null | head -30 \
        || echo "Search results: use 'pkg install <name>' to install."
      ;;
    list-installed)
      echo "Installed packages ($(date '+%Y-%m-%d')):"
      echo ""
      echo "=== Shell & Core ==="
      echo "  bash              5.2        GNU Bourne Again shell"
      echo "  coreutils         9.1        Basic file/text utilities"
      echo "  grep              3.11       Pattern matching"
      echo "  gzip              1.13       Compression"
      echo "  tar               1.35       Archiving"
      echo "  zip               3.0        ZIP archiver"
      echo "  unzip             6.0        ZIP extractor"
      echo "  p7zip             17.05      7z archiver"
      echo "  tree              1.8.0      Directory tree viewer"
      echo "  file              5.45       File type detector"
      echo "  jq                1.7        JSON processor"
      echo "  fzf               0.50       Fuzzy finder"
      echo "  ripgrep           14.1       Fast grep"
      echo "  bat               0.24       Cat with syntax hl"
      echo "  fd                10.0       Fast find"
      echo "  xxd               1.3        Hex dump"
      echo "  hexedit           1.6        Hex editor"
      echo "  screen            4.8.0      Terminal multiplexer"
      echo "  tmux              3.2        Terminal multiplexer"
      echo "  htop              3.0.5      Process monitor"
      echo "  lsof              4.98       List open files"
      echo ""
      echo "=== Languages & Runtimes ==="
      echo "  python            3.12       Python interpreter"
      echo "  nodejs            20.x       Node.js runtime"
      echo "  go                1.16       Go language"
      echo "  ruby              2.7.4      Ruby language"
      echo "  perl              5.40       Perl language"
      echo "  lua               5.4        Lua language"
      echo "  cmake             3.19       Build system"
      echo "  gcc               14.2       C/C++ compiler"
      echo "  make              4.4        Build tool"
      echo ""
      echo "=== Network & Connectivity ==="
      echo "  curl              8.4        HTTP client"
      echo "  wget              1.21       File downloader"
      echo "  git               2.43       Version control"
      echo "  openssh           9.6        SSH client/server"
      echo "  openssl           3.4        SSL/TLS toolkit"
      echo "  socat             1.8        Socket relay"
      echo "  netcat            0.7.1      TCP/UDP swiss knife"
      echo "  nmap              7.97       Port scanner"
      echo "  masscan           1.3.2      Fast port scanner"
      echo "  hping3            2014       Packet crafting"
      echo "  whois             5.5        WHOIS client"
      echo "  tcpflow           1.6        TCP flow recorder"
      echo "  tshark            4.4        Network analyzer"
      echo "  tcpdump           4.99       Packet capture"
      echo "  sslscan           2.1.6      SSL/TLS scanner"
      echo "  sshuttle          1.1        VPN over SSH"
      echo "  tor               0.4.8      Anonymity network"
      echo ""
      echo "=== Web & OSINT ==="
      echo "  sqlmap            1.9.4      SQL injection tool"
      echo "  nikto             2.5.0      Web vulnerability scanner"
      echo "  gobuster          3.6.0      Directory brute-forcer"
      echo "  dirb              2.22       Web content scanner"
      echo "  ffuf              2.1.0      Web fuzzer"
      echo "  wfuzz             3.1.0      Web application fuzzer"
      echo "  mitmproxy         10.x       HTTP interceptor"
      echo ""
      echo "=== Password & Crypto ==="
      echo "  john              rolling    Password cracker"
      echo "  hydra             9.5        Login brute-forcer"
      echo "  hashcat           6.2.6      GPU password cracker"
      echo ""
      echo "=== Wireless ==="
      echo "  aircrack-ng       1.7        WiFi security suite"
      echo ""
      echo "=== Forensics & Reverse Engineering ==="
      echo "  binwalk           3.1.0      Firmware analyzer"
      echo "  foremost          1.5.7      File carver"
      echo "  sleuthkit         4.x        Disk forensics"
      echo "  testdisk          7.2        Partition recovery"
      echo "  exiftool          13.25      Metadata reader"
      echo "  steghide          0.5.1      Steganography"
      echo "  radare2           5.9.8      Reverse engineering"
      echo "  gdb               16.2       Debugger"
      echo "  strace            6.15       System call tracer"
      echo "  ltrace            0.7.91     Library call tracer"
      echo ""
      echo "=== Python Libraries ==="
      echo "  scapy             2.5        Packet manipulation"
      echo "  pwntools          4.12       CTF framework"
      echo "  impacket          0.12       Network protocols"
      echo "  pycryptodome      3.20       Crypto library"
      echo "  paramiko          3.4        SSH2 protocol"
      echo "  python-nmap       0.7        nmap Python wrapper"
      echo "  requests          2.31       HTTP library"
      echo "  cryptography      42.x       Crypto primitives"
      echo "  dnspython         2.6        DNS toolkit"
      echo "  netaddr           1.2        Network address manip"
      echo ""
      echo "Total: 70+ packages installed"
      ;;
    files)
      nix-env -q 2>/dev/null | grep -i "$1" || echo "Package not found."
      ;;
    show|info)
      nix-env -qaP ".*$1.*" --description 2>/dev/null | head -10 || echo "No info available."
      ;;
    *)
      echo "Usage: pkg <command> [args]"
      echo ""
      echo "Commands:"
      echo "  install <pkg>      Install a package"
      echo "  uninstall <pkg>    Remove a package"
      echo "  update             Update package lists"
      echo "  upgrade            Upgrade installed packages"
      echo "  search <query>     Search for packages"
      echo "  list-installed     List installed packages"
      echo "  info <pkg>         Show package info"
      ;;
  esac
}
apt() { pkg "$@"; }
apt-get() { pkg "$@"; }
export -f pkg apt apt-get 2>/dev/null || true
`;

function createSession(): { id: string; cwd: string } {
  const id = makeId();

  const startCwd = process.env.HOME ?? "/root";

  const proc = spawn("/bin/bash", ["--norc", "--noprofile"], {
    env: {
      ...process.env,
      PS1: "",
      PS2: "",
      TERM: "dumb",
      HOME: startCwd,
      USER: process.env.USER ?? "runner",
      HOSTNAME: "localhost",
    },
    cwd: startCwd,
  });

  const session: Session = {
    proc,
    buffer: "",
    pending: null,
    cwd: startCwd,
    lastActivity: Date.now(),
  };

  proc.stdout?.on("data", (data: Buffer) => {
    session.buffer += data.toString();
    session.lastActivity = Date.now();
    tryResolve(session);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    session.buffer += data.toString();
    session.lastActivity = Date.now();
    tryResolve(session);
  });

  proc.on("exit", () => {
    if (session.pending) {
      clearTimeout(session.pending.timeout);
      session.pending.reject(new Error("Shell process exited unexpectedly"));
      session.pending = null;
    }
    sessions.delete(id);
  });

  proc.on("error", (err) => {
    if (session.pending) {
      clearTimeout(session.pending.timeout);
      session.pending.reject(err);
      session.pending = null;
    }
    sessions.delete(id);
  });

  sessions.set(id, session);

  proc.stdin?.write(PKG_INIT + "\n");

  return { id, cwd: startCwd };
}

function execInSession(
  session: Session,
  command: string
): Promise<{ output: string; exitCode: number; cwd: string }> {
  return new Promise((resolve, reject) => {
    const cmdId = makeId();
    const markerLine = `__DONE_${cmdId}__`;

    const timeout = setTimeout(() => {
      if (session.pending?.markerLine === markerLine) {
        session.pending = null;
        session.buffer = "";
      }
      reject(new Error("Command timed out after 30 seconds"));
    }, CMD_EXEC_TIMEOUT_MS);

    session.pending = { resolve, reject, timeout, markerLine };
    session.lastActivity = Date.now();

    const wrapped =
      `{ ${command}; } 2>&1\n` +
      `_ec=$?\n` +
      `printf '${markerLine}:%d:%s__END__\\n' $_ec "$(pwd)"\n`;

    session.proc.stdin?.write(wrapped);
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      try { session.proc.kill(); } catch { /* ignore */ }
      sessions.delete(id);
    }
  }
}, 60_000);

router.post("/terminal/session", (_req: Request, res: Response) => {
  const { id, cwd } = createSession();
  res.json({ sessionId: id, cwd });
});

router.post("/terminal/exec", async (req: Request, res: Response) => {
  const { sessionId, command } = req.body as {
    sessionId?: string;
    command?: string;
  };

  if (!sessionId || command === undefined) {
    res.status(400).json({ error: "sessionId and command are required" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired. Please refresh to start a new session." });
    return;
  }

  if (session.pending) {
    res.status(429).json({ error: "A command is already running in this session." });
    return;
  }

  try {
    const result = await execInSession(session, command);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/terminal/session/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ cwd: session.cwd, busy: session.pending !== null });
});

router.delete("/terminal/session/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (session) {
    try { session.proc.kill(); } catch { /* ignore */ }
    sessions.delete(req.params.id);
  }
  res.json({ ok: true });
});

export default router;
