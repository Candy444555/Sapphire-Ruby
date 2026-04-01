import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { MessageSquare, Trash2, RefreshCw, Square } from "lucide-react";
import { useTerminal } from "@/hooks/use-terminal";

function formatCwd(cwd: string): string {
  return cwd.replace(/^\/root(?=$|\/)/, "~");
}

export default function TerminalPage() {
  const {
    cwd,
    history,
    isRunning,
    isConnecting,
    connectError,
    exec,
    clearHistory,
    reconnect,
  } = useTerminal();

  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isRunning]);

  useEffect(() => {
    if (!isConnecting && !isRunning) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isConnecting, isRunning]);

  const submit = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || isRunning) return;

      if (trimmed === "clear" || trimmed === "cls") {
        clearHistory();
        setInput("");
        return;
      }

      setCmdHistory((prev) => [trimmed, ...prev.slice(0, 199)]);
      setHistIdx(-1);
      setInput("");

      try {
        await exec(trimmed);
      } catch { /* error shown in history */ }
    },
    [isRunning, exec, clearHistory]
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
      clearHistory();
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInput("");
    }
  };

  const displayCwd = formatCwd(cwd);

  return (
    <div
      className="flex flex-col h-screen bg-[#0d1117] font-mono select-text"
      ref={containerRef}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-xs text-[#8b949e]">
            root@kali — {displayCwd}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); clearHistory(); }}
            title="Clear (Ctrl+L)"
            className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#c9d1d9] px-2 py-1 rounded hover:bg-[#30363d] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); reconnect(); }}
            title="New session"
            className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#c9d1d9] px-2 py-1 rounded hover:bg-[#30363d] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>
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
        <div className="text-[#8b949e] text-xs space-y-0.5 mb-2 select-none">
          <div className="text-[#58a6ff] font-bold text-sm">
            ┌─ Kali Linux Terminal ─────────────────────────
          </div>
          <div>│  Real shell. Commands execute on the server.</div>
          <div>│  Ctrl+L clear  ·  ↑↓ history  ·  Ctrl+C cancel input</div>
          <div className="text-[#3fb950]">└─ Connected</div>
        </div>

        {isConnecting && (
          <div className="flex items-center gap-2 text-[#d29922]">
            <span className="animate-pulse text-base">◆</span>
            <span>Connecting to shell...</span>
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
            {/* Prompt line 1 */}
            <div className="flex flex-wrap items-center text-sm">
              <span className="text-[#3fb950]">┌──(</span>
              <span className="text-[#ff7b72]">root㉿kali</span>
              <span className="text-[#3fb950]">)-[</span>
              <span className="text-[#58a6ff]">{formatCwd(entry.cwd)}</span>
              <span className="text-[#3fb950]">]</span>
            </div>
            {/* Prompt line 2 + command */}
            <div className="flex items-center">
              <span className="text-[#3fb950]">└─</span>
              <span className={entry.exitCode !== 0 ? "text-[#f85149]" : "text-[#3fb950]"}>
                #&nbsp;
              </span>
              <span className="text-[#e6edf3]">{entry.command}</span>
            </div>
            {/* Output */}
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

        {/* Running spinner */}
        {isRunning && (
          <div className="flex items-center gap-2 text-[#d29922] text-sm pl-2">
            <span className="animate-spin inline-block">⠋</span>
            <span>executing...</span>
          </div>
        )}

        {/* Live input prompt */}
        {!isConnecting && !connectError && (
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center text-sm">
              <span className="text-[#3fb950]">┌──(</span>
              <span className="text-[#ff7b72]">root㉿kali</span>
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
                disabled={isRunning || isConnecting}
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
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
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
