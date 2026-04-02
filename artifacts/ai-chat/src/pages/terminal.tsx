import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Server, X, Wifi, WifiOff, Eye, EyeOff, Plus, MoreVertical } from "lucide-react";
import { useTerminal } from "@/hooks/use-terminal";
import { useSsh, type SshConfig } from "@/hooks/use-ssh";

function formatCwd(cwd: string): string {
  const home = "/root";
  if (cwd === home) return "~";
  if (cwd.startsWith(home + "/")) return "~" + cwd.slice(home.length);
  return cwd;
}

interface ConnectModalProps {
  onClose: () => void;
  onConnect: (cfg: SshConfig) => Promise<void>;
  connecting: boolean;
  error: string | null;
}

function ConnectModal({ onClose, onConnect, connecting, error }: ConnectModalProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("root");
  const [authMode, setAuthMode] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConnect({
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      ...(authMode === "password" ? { password } : { privateKey: privateKey.trim() }),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl p-5 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#50fa7b]" />
            <h2 className="text-sm font-semibold text-white">SSH Connection</h2>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs text-[#888] mb-1">Hostname / IP</label>
              <input
                type="text" value={host} onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.1" required
                className="w-full bg-[#000] border border-[#333] rounded px-2.5 py-1.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#50fa7b] font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Port</label>
              <input
                type="number" value={port} onChange={(e) => setPort(e.target.value)}
                placeholder="22" min={1} max={65535}
                className="w-full bg-[#000] border border-[#333] rounded px-2.5 py-1.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#50fa7b] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#888] mb-1">Username</label>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="root" required
              className="w-full bg-[#000] border border-[#333] rounded px-2.5 py-1.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#50fa7b] font-mono"
            />
          </div>

          <div>
            <div className="flex gap-3 mb-2">
              {(["password", "key"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setAuthMode(m)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${authMode === m ? "bg-[#50fa7b] text-black font-semibold" : "text-[#888] hover:text-white"}`}>
                  {m === "password" ? "Password" : "Private Key"}
                </button>
              ))}
            </div>
            {authMode === "password" ? (
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="password"
                  className="w-full bg-[#000] border border-[#333] rounded px-2.5 py-1.5 pr-8 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#50fa7b] font-mono"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-white">
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n..."} rows={4}
                className="w-full bg-[#000] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#50fa7b] font-mono resize-none"
              />
            )}
          </div>

          {error && (
            <div className="bg-[#200] border border-[#f55]/40 rounded px-3 py-2 text-xs text-[#f55]">{error}</div>
          )}

          <button type="submit" disabled={connecting || !host.trim()}
            className="w-full bg-[#50fa7b] hover:bg-[#69ff94] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold py-2 rounded transition-colors">
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}

const EXTRA_KEYS = [
  { label: "ESC",  action: "esc" },
  { label: "TAB",  action: "tab" },
  { label: "CTRL", action: "ctrl" },
  { label: "ALT",  action: "alt" },
  { label: "-",    action: "insert:-" },
  { label: "|",    action: "insert:|" },
  { label: "HOME", action: "home" },
  { label: "↑",    action: "up" },
  { label: "END",  action: "end" },
  { label: "PGUP", action: "pgup" },
  { label: "←",    action: "left" },
  { label: "→",    action: "right" },
  { label: "PGDN", action: "pgdn" },
  { label: "DEL",  action: "del" },
  { label: "↓",    action: "down" },
];

const TERMUX_MOTD = `Welcome to Termux!

Community forum  : https://termux.dev/community
Gitter chat      : https://gitter.im/termux/termux
IRC channel      : #termux on libera.chat
GitHub           : https://github.com/termux

Working with packages:

 * Search packages:   pkg search <query>
 * Install a package: pkg install <package>
 * Upgrade packages:  pkg upgrade

Subscribed repositories:
 * root-repo  : packages.termux.dev

For support see: https://termux.dev/docs/faq`;

export default function TerminalPage() {
  const local = useTerminal();
  const ssh = useSsh();

  const mode = ssh.state.connected ? "vps" : "local";

  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showModal, setShowModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);

  const [vpsHistory, setVpsHistory] = useState<Array<{
    command: string; output: string; exitCode: number; cwd: string; timestamp: number;
  }>>([]);
  const [vpsRunning, setVpsRunning] = useState(false);
  const [vpsCwd, setVpsCwd] = useState("~");

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const history = mode === "vps" ? vpsHistory : local.history;
  const isRunning = mode === "vps" ? vpsRunning : local.isRunning;
  const cwd = mode === "vps" ? vpsCwd : formatCwd(local.cwd);
  const isConnecting = mode === "local" && local.isConnecting;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isRunning]);

  useEffect(() => {
    if (!isConnecting && !isRunning) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isConnecting, isRunning, mode]);

  const clearAll = useCallback(() => {
    if (mode === "vps") setVpsHistory([]);
    else local.clearHistory();
  }, [mode, local]);

  const handleConnect = async (cfg: SshConfig) => {
    await ssh.connect(cfg);
    setVpsHistory([]);
    setVpsCwd("~");
    setShowModal(false);
    setShowMenu(false);
  };

  const handleDisconnect = () => {
    ssh.disconnect();
    setVpsHistory([]);
    setVpsCwd("~");
    setShowMenu(false);
  };

  const submit = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || isRunning) return;

      if (trimmed === "clear" || trimmed === "cls") {
        clearAll();
        setInput("");
        return;
      }

      setCmdHistory((prev) => [trimmed, ...prev.slice(0, 499)]);
      setHistIdx(-1);
      setInput("");

      if (mode === "vps") {
        setVpsRunning(true);
        const entry = { command: trimmed, output: "", exitCode: 0, cwd: vpsCwd, timestamp: Date.now() };
        try {
          const result = await ssh.exec(trimmed);
          entry.output = result.output;
          entry.exitCode = result.exitCode;
          if (result.cwd && result.cwd !== "~") setVpsCwd(result.cwd);
        } catch (err) {
          entry.output = err instanceof Error ? err.message : "Error";
          entry.exitCode = 1;
        }
        setVpsHistory((prev) => [...prev, entry]);
        setVpsRunning(false);
      } else {
        try { await local.exec(trimmed); } catch { /* shown in history */ }
      }
    },
    [isRunning, mode, vpsCwd, ssh, local, clearAll]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (ctrlActive) {
      setCtrlActive(false);
      if (e.key === "c" || e.key === "C") { e.preventDefault(); setInput(""); return; }
      if (e.key === "l" || e.key === "L") { e.preventDefault(); clearAll(); return; }
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        const el = inputRef.current;
        if (el) { el.setSelectionRange(0, 0); }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        const el = inputRef.current;
        if (el) { el.setSelectionRange(input.length, input.length); }
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      submit(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(next);
      setInput(cmdHistory[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setInput(next === -1 ? "" : (cmdHistory[next] ?? ""));
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      clearAll();
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInput("");
    } else if (e.key === "Tab") {
      e.preventDefault();
      setInput((v) => v + "\t");
    }
  };

  const handleExtraKey = (action: string) => {
    const el = inputRef.current;
    if (!el) return;

    if (action === "ctrl") {
      setCtrlActive((v) => !v);
      setAltActive(false);
      el.focus();
      return;
    }
    if (action === "alt") {
      setAltActive((v) => !v);
      setCtrlActive(false);
      el.focus();
      return;
    }

    setCtrlActive(false);
    setAltActive(false);

    switch (action) {
      case "esc":
        setInput("");
        break;
      case "tab":
        setInput((v) => v + "\t");
        break;
      case "up": {
        const next = Math.min(histIdx + 1, cmdHistory.length - 1);
        setHistIdx(next);
        setInput(cmdHistory[next] ?? "");
        break;
      }
      case "down": {
        const next = Math.max(histIdx - 1, -1);
        setHistIdx(next);
        setInput(next === -1 ? "" : (cmdHistory[next] ?? ""));
        break;
      }
      case "home":
        setTimeout(() => el.setSelectionRange(0, 0), 0);
        break;
      case "end":
        setTimeout(() => el.setSelectionRange(input.length, input.length), 0);
        break;
      case "left": {
        const pos = (el.selectionStart ?? 0) - 1;
        setTimeout(() => el.setSelectionRange(Math.max(0, pos), Math.max(0, pos)), 0);
        break;
      }
      case "right": {
        const pos = (el.selectionStart ?? 0) + 1;
        setTimeout(() => el.setSelectionRange(Math.min(input.length, pos), Math.min(input.length, pos)), 0);
        break;
      }
      case "del":
        setInput((v) => {
          const pos = el.selectionStart ?? v.length;
          return v.slice(0, pos) + v.slice(pos + 1);
        });
        break;
      case "pgup":
        outputRef.current?.scrollBy(0, -200);
        break;
      case "pgdn":
        outputRef.current?.scrollBy(0, 200);
        break;
      default:
        if (action.startsWith("insert:")) {
          const ch = action.slice(7);
          setInput((v) => {
            const pos = el.selectionStart ?? v.length;
            return v.slice(0, pos) + ch + v.slice(pos);
          });
        }
    }
    el.focus();
  };

  const promptHost = mode === "vps"
    ? `${ssh.state.username}@${ssh.state.host}`
    : "u0_a123@localhost";
  const displayCwd = cwd;

  return (
    <div className="flex flex-col h-screen bg-[#000] font-mono select-text text-white overflow-hidden"
      onClick={() => { inputRef.current?.focus(); setShowMenu(false); }}
    >
      {showModal && (
        <ConnectModal
          onClose={() => setShowModal(false)}
          onConnect={handleConnect}
          connecting={ssh.state.connecting}
          error={ssh.state.error}
        />
      )}

      {/* Termux title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-[#2a2a2a] flex-shrink-0"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-[#50fa7b] text-xs font-bold tracking-wider">Termux</span>
          {mode === "vps" && (
            <span className="flex items-center gap-1 text-[10px] text-[#50fa7b] bg-[#50fa7b]/10 px-1.5 py-0.5 rounded">
              <Wifi className="w-2.5 h-2.5" />
              {ssh.state.username}@{ssh.state.host}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="p-1 text-[#888] hover:text-white rounded transition-colors relative"
          >
            <MoreVertical className="w-4 h-4" />
            {showMenu && (
              <div className="absolute right-0 top-7 w-44 bg-[#1e1e1e] border border-[#333] rounded shadow-xl z-40 py-1 text-left">
                <button
                  onClick={(e) => { e.stopPropagation(); clearAll(); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2 text-xs text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  Clear scrollback
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); local.reconnect(); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2 text-xs text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  New session
                </button>
                {mode === "vps" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
                    className="w-full text-left px-4 py-2 text-xs text-[#ff5555] hover:bg-[#2a2a2a] transition-colors"
                  >
                    Disconnect SSH
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowModal(true); setShowMenu(false); }}
                    className="w-full text-left px-4 py-2 text-xs text-[#50fa7b] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2"
                  >
                    <Server className="w-3 h-3" />
                    SSH / VPS connect
                  </button>
                )}
                <div className="border-t border-[#333] mt-1 pt-1">
                  <Link href="/">
                    <button className="w-full text-left px-4 py-2 text-xs text-[#888] hover:bg-[#2a2a2a] transition-colors">
                      Back to chat
                    </button>
                  </Link>
                </div>
              </div>
            )}
          </button>
          <button className="p-1 text-[#888] hover:text-white rounded transition-colors" title="New session"
            onClick={() => local.reconnect()}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Output / scrollback area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-1 pt-1 pb-0 text-[13px] leading-[1.45]"
        style={{ fontFamily: "'Courier New', 'DejaVu Sans Mono', monospace" }}
      >
        {/* MOTD */}
        <pre className="text-[#ccc] text-[12px] mb-2 whitespace-pre-wrap select-none">{TERMUX_MOTD}</pre>

        {isConnecting && (
          <div className="text-[#f1fa8c] mb-1">Initializing shell session...</div>
        )}
        {local.connectError && mode === "local" && (
          <div className="text-[#ff5555] mb-1">{local.connectError}</div>
        )}
        {ssh.state.connecting && (
          <div className="text-[#f1fa8c] mb-1">Connecting to {ssh.state.host}...</div>
        )}

        {/* Command history */}
        {history.map((entry, i) => (
          <div key={i} className="mb-0.5">
            {/* Prompt */}
            <div>
              <span className="text-[#50fa7b]">{promptHost}</span>
              <span className="text-white">:</span>
              <span className="text-[#8be9fd]">{mode === "vps" ? entry.cwd : formatCwd(entry.cwd)}</span>
              <span className="text-white"> $ </span>
              <span className="text-white">{entry.command}</span>
            </div>
            {/* Output */}
            {entry.output && (
              <pre className={`whitespace-pre-wrap break-all text-[13px] ${
                entry.exitCode !== 0 ? "text-[#ff5555]" : "text-[#f8f8f2]"
              }`}>
                {entry.output.replace(/\n$/, "")}
              </pre>
            )}
          </div>
        ))}

        {/* Running indicator */}
        {isRunning && (
          <div className="text-[#f1fa8c] animate-pulse">▌</div>
        )}

        {/* Live prompt */}
        {!isConnecting && !ssh.state.connecting && (
          <div className="flex items-center flex-wrap">
            <span className="text-[#50fa7b]">{promptHost}</span>
            <span className="text-white">:</span>
            <span className="text-[#8be9fd]">{displayCwd}</span>
            <span className="text-white"> $ </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning || isConnecting || ssh.state.connecting}
              className="flex-1 min-w-0 bg-transparent outline-none border-none text-white caret-white disabled:opacity-60"
              style={{ fontFamily: "inherit", fontSize: "13px" }}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Extra keys row — exact Termux layout */}
      <div className="flex-shrink-0 bg-[#111] border-t border-[#222] overflow-x-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-max">
          {EXTRA_KEYS.map(({ label, action }) => {
            const isCtrl = action === "ctrl" && ctrlActive;
            const isAlt = action === "alt" && altActive;
            const active = isCtrl || isAlt;
            return (
              <button
                key={action}
                onMouseDown={(e) => { e.preventDefault(); handleExtraKey(action); }}
                onTouchStart={(e) => { e.preventDefault(); handleExtraKey(action); }}
                className={`
                  px-3.5 py-2.5 text-xs font-bold tracking-wide flex-shrink-0 transition-colors select-none
                  border-r border-[#1f1f1f]
                  ${active
                    ? "bg-[#50fa7b] text-black"
                    : "bg-[#111] text-[#aaa] hover:bg-[#1e1e1e] hover:text-white active:bg-[#333]"
                  }
                `}
                style={{ minWidth: "2.8rem", touchAction: "none" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
