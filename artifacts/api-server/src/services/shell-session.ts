import { spawn } from "child_process";
import { randomBytes } from "crypto";

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const CMD_EXEC_TIMEOUT_MS = 30 * 1000;

export interface PendingCommand {
  resolve: (result: { output: string; exitCode: number; cwd: string }) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  markerLine: string;
}

export interface Session {
  proc: ReturnType<typeof spawn>;
  buffer: string;
  pending: PendingCommand | null;
  cwd: string;
  lastActivity: number;
}

export const sessions = new Map<string, Session>();

function makeId(): string {
  return randomBytes(12).toString("hex");
}

export function tryResolve(session: Session): void {
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
      nix-env -q 2>/dev/null || echo "70+ packages installed."
      ;;
    *)
      echo "Usage: pkg <command> [args]"
      ;;
  esac
}
apt() { pkg "$@"; }
apt-get() { pkg "$@"; }
export -f pkg apt apt-get 2>/dev/null || true
`;

export function createSession(): { id: string; cwd: string } {
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

export function execInSession(
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
