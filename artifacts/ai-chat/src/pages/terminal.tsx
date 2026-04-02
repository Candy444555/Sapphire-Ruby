import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { MessageSquare, Trash2, RefreshCw, Square, Server, X, Wifi, WifiOff, Eye, EyeOff } from "lucide-react";
import { useTerminal } from "@/hooks/use-terminal";
import { useSsh, type SshConfig } from "@/hooks/use-ssh";

function formatCwd(cwd: string): string {
  return cwd.replace(/^\/root(?=$|\/)/, "~");
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
    const cfg: SshConfig = {
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      ...(authMode === "password" ? { password } : { privateKey: privateKey.trim() }),
    };
    await onConnect(cfg);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#58a6ff]" />
            <h2 className="text-sm font-semibold text-[#e6edf3]">Connect to VPS</h2>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#e6edf3] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-[#8b949e] mb-1">Host / IP</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.1"
                required
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
                min={1}
                max={65535}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
              required
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
            />
          </div>

          <div>
            <div className="flex items-center gap-4 mb-2">
              <label className="text-xs text-[#8b949e]">Auth</label>
              <button
                type="button"
                onClick={() => setAuthMode("password")}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${authMode === "password" ? "bg-[#58a6ff] text-white" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("key")}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${authMode === "key" ? "bg-[#58a6ff] text-white" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
              >
                Private Key
              </button>
            </div>

            {authMode === "password" ? (
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 pr-9 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-[#e6edf3]"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                rows={5}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] font-mono resize-none"
              />
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-[#3d1a1f] border border-[#f85149]/40 rounded px-3 py-2 text-xs text-[#f85149]">
              <span className="mt-0.5">✖</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={connecting || !host.trim() || !username.trim()}
            className="w-full bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded transition-colors"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function TerminalPage() {
  const local = useTerminal();
  const ssh = useSsh();

  const mode = ssh.state.connected ? "vps" : "local";

  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showModal, setShowModal] = useState(false);
  const [vpsHistory, setVpsHistory] = useState<Array<{
    command: string; output: string; exitCode: number; cwd: string; timestamp: number;
  }>>([]);
  const [vpsRunning, setVpsRunning] = useState(false);
  const [vpsCwd, setVpsCwd] = useState("~");

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = mode === "vps" ? vpsHistory : local.history;
  const isRunning = mode === "vps" ? vpsRunning : local.isRunning;
  const cwd = mode === "vps" ? vpsCwd : local.cwd;
  const isConnecting = mode === "local" && local.isConnecting;
  const connectError = mode === "local" ? local.connectError : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isRunning]);

  useEffect(() => {
    if (!isConnecting && !isRunning) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isConnecting, isRunning, mode]);

  const handleConnect = async (cfg: SshConfig) => {
    await ssh.connect(cfg);
    setVpsHistory([]);
    setVpsCwd("~");
    setShowModal(false);
  };

  const handleDisconnect = () => {
    ssh.disconnect();
    setVpsHistory([]);
    setVpsCwd("~");
  };

  const submit = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || isRunning) return;

      if (trimmed === "clear" || trimmed === "cls") {
        if (mode === "vps") setVpsHistory([]);
        else local.clearHistory();
        setInput("");
        return;
      }

      setCmdHistory((prev) => [trimmed, ...prev.slice(0, 199)]);
      setHistIdx(-1);
      setInput("");

      if (mode === "vps") {
        setVpsRunning(true);
        const entry = {
          command: trimmed,
          output: "",
          exitCode: 0,
          cwd: vpsCwd,
          timestamp: Date.now(),
        };
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
    [isRunning, mode, vpsCwd, ssh, local]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      if (mode === "vps") setVpsHistory([]);
      else local.clearHistory();
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInput("");
    }
  };

  const promptUser = mode === "vps"
    ? `${ssh.state.username}@${ssh.state.host}`
    : "root㉿kali";
  const promptUserColor = mode === "vps" ? "text-[#d2a8ff]" : "text-[#ff7b72]";
  const displayCwd = mode === "vps" ? vpsCwd : formatCwd(cwd);

  return (
    <div
      className="flex flex-col h-screen bg-[#0d1117] font-mono select-text"
      onClick={() => inputRef.current?.focus()}
    >
      {showModal && (
        <ConnectModal
          onClose={() => setShowModal(false)}
          onConnect={handleConnect}
          connecting={ssh.state.connecting}
          error={ssh.state.error}
        />
      )}

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          {mode === "vps" ? (
            <span className="text-xs text-[#d2a8ff] flex items-center gap-1.5">
              <Wifi className="w-3 h-3" />
              {ssh.state.username}@{ssh.state.host} — {displayCwd}
            </span>
          ) : (
            <span className="text-xs text-[#8b949e]">
              root@kali — {displayCwd}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (mode === "vps") setVpsHistory([]);
              else local.clearHistory();
            }}
            title="Clear (Ctrl+L)"
            className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#c9d1d9] px-2 py-1 rounded hover:bg-[#30363d] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>

          {mode === "local" && (
            <button
              onClick={(e) => { e.stopPropagation(); local.reconnect(); }}
              title="New session"
              className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#c9d1d9] px-2 py-1 rounded hover:bg-[#30363d] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          {mode === "vps" ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
              className="flex items-center gap-1 text-xs text-[#f85149] hover:text-[#ffa198] px-2 py-1 rounded hover:bg-[#30363d] transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
              className="flex items-center gap-1 text-xs text-[#58a6ff] hover:text-[#79c0ff] px-2 py-1 rounded hover:bg-[#30363d] transition-colors"
            >
              <Server className="w-3.5 h-3.5" />
              VPS
            </button>
          )}

          <Link href="/">
            <button className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#c9d1d9] px-2 py-1 rounded hover:bg-[#30363d] transition-colors">
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
          </Link>
        </div>
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm leading-relaxed">
        {/* Banner */}
        <div className="text-xs space-y-0.5 mb-3 select-none">
          <div className="text-[#268bd2] font-bold">
            {`         .;;,.`}<br/>
            {`        cXMM'`}<br/>
            {`       ;MMMM:`}<br/>
            {`     .;M MMM`}<br/>
            {`    -MMMMMMM+.`}<br/>
            {`   /MMMMMMMMMMm.`}<br/>
            {`  /MMMMMMMMMMMMMM.`}
          </div>
          <div className="text-[#3fb950] font-bold text-sm mt-1">
            ██╗  ██╗ █████╗ ██╗     ██╗    ██╗     ██╗███╗   ██╗██╗   ██╗██╗  ██╗
          </div>
          <div className="text-[#3fb950]">
            ██║ ██╔╝██╔══██╗██║     ██║    ██║     ██║████╗  ██║██║   ██║╚██╗██╔╝
          </div>
          <div className="text-[#3fb950]">
            █████╔╝ ███████║██║     ██║    ██║     ██║██╔██╗ ██║██║   ██║ ╚███╔╝
          </div>
          <div className="text-[#3fb950]">
            ██╔═██╗ ██╔══██║██║     ██║    ██║     ██║██║╚██╗██║██║   ██║ ██╔██╗
          </div>
          <div className="text-[#3fb950]">
            ██║  ██╗██║  ██║███████╗██║    ███████╗██║██║ ╚████║╚██████╔╝██╔╝ ██╗
          </div>
          <div className="mt-2 text-[#8b949e]">┌──────────────────────────────────────────────────────────────┐</div>
          <div className="text-[#8b949e]">│  <span className="text-[#58a6ff]">Kali Linux</span> · Integrated Terminal · Real Shell Execution     │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#3fb950]">50+ tools installed</span> · Ctrl+L clear · ↑↓ history            │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Network</span>: nmap masscan hping tcpdump tshark socat netcat        │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Wireless</span>: aircrack-ng airmon-ng airodump-ng aireplay-ng wifite  │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Password</span>: hydra john hashcat medusa pixiewps hcxdumptool       │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Web</span>: sqlmap nikto dirb gobuster ffuf feroxbuster wfuzz          │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Sniff</span>: bettercap ettercap mitmproxy dsniff                      │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Exploit</span>: msfconsole msfvenom searchsploit evil-winrm chisel     │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Forensics</span>: binwalk foremost sleuthkit testdisk exiftool         │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">RE</span>: radare2 gdb ltrace strace strings hexedit                   │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">OSINT</span>: theHarvester sherlock recon-ng amass subfinder nuclei     │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Other</span>: tor proxychains4 sslscan steghide bettercap              │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#d29922]">Python</span>: impacket scapy pwntools pycryptodome python-nmap        │</div>
          <div className="text-[#8b949e]">│  <span className="text-[#3fb950]">VPS</span>: click <span className="text-[#58a6ff]">VPS</span> in the toolbar to connect your root server      │</div>
          <div className="text-[#8b949e]">└──────────────────────────────────────────────────────────────┘</div>
        </div>

        {isConnecting && (
          <div className="flex items-center gap-2 text-[#d29922]">
            <span className="animate-pulse text-base">◆</span>
            <span>Connecting to shell...</span>
          </div>
        )}

        {ssh.state.connecting && (
          <div className="flex items-center gap-2 text-[#d29922]">
            <span className="animate-pulse text-base">◆</span>
            <span>Connecting to VPS...</span>
          </div>
        )}

        {connectError && (
          <div className="text-[#f85149] flex items-center gap-2">
            <span>✖</span>
            <span>{connectError}</span>
          </div>
        )}

        {/* Command history */}
        {history.map((entry, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex flex-wrap items-center text-sm">
              <span className="text-[#3fb950]">┌──(</span>
              <span className={promptUserColor}>{promptUser}</span>
              <span className="text-[#3fb950]">)-[</span>
              <span className="text-[#58a6ff]">{mode === "vps" ? entry.cwd : formatCwd(entry.cwd)}</span>
              <span className="text-[#3fb950]">]</span>
            </div>
            <div className="flex items-center">
              <span className="text-[#3fb950]">└─</span>
              <span className={entry.exitCode !== 0 ? "text-[#f85149]" : "text-[#3fb950]"}>
                #&nbsp;
              </span>
              <span className="text-[#e6edf3]">{entry.command}</span>
            </div>
            {entry.output && (
              <pre
                className={`whitespace-pre-wrap break-words text-sm pl-2 border-l-2 ml-1 ${
                  entry.exitCode !== 0
                    ? "border-[#f85149] text-[#ffa198]"
                    : "border-[#30363d] text-[#c9d1d9]"
                }`}
              >
                {entry.output.replace(/\n$/, "")}
              </pre>
            )}
          </div>
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 text-[#d29922] text-sm pl-2">
            <span className="animate-spin inline-block">⠋</span>
            <span>executing...</span>
          </div>
        )}

        {!isConnecting && !connectError && !ssh.state.connecting && (
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center text-sm">
              <span className="text-[#3fb950]">┌──(</span>
              <span className={promptUserColor}>{promptUser}</span>
              <span className="text-[#3fb950]">)-[</span>
              <span className="text-[#58a6ff]">{displayCwd}</span>
              <span className="text-[#3fb950]">]</span>
            </div>
            <div className="flex items-center text-sm">
              <span className="text-[#3fb950]">└─</span>
              <span className="text-[#3fb950]">#&nbsp;</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isRunning || isConnecting || ssh.state.connecting}
                className="flex-1 bg-transparent outline-none border-none text-[#e6edf3] caret-[#58a6ff] disabled:opacity-50"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              {isRunning && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#f85149] px-2"
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
