import { useState, useRef, useCallback, useEffect } from "react";

const API = "/api";

export interface HistoryEntry {
  command: string;
  output: string;
  exitCode: number;
  cwd: string;
  timestamp: number;
}

export function useTerminal() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("/root");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);

  const createSession = useCallback(async () => {
    setIsConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch(`${API}/terminal/session`, { method: "POST" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setSessionId(data.sessionId);
      setCwd(data.cwd ?? "/root");
      sessionRef.current = data.sessionId;
      setIsConnecting(false);
      return data.sessionId as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setConnectError(msg);
      setIsConnecting(false);
      throw err;
    }
  }, []);

  const destroySession = useCallback(async (id: string) => {
    try {
      await fetch(`${API}/terminal/session/${id}`, { method: "DELETE" });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    createSession();
    return () => {
      if (sessionRef.current) destroySession(sessionRef.current);
    };
  }, []);

  const exec = useCallback(
    async (command: string): Promise<HistoryEntry> => {
      const sid = sessionRef.current;
      if (!sid || isRunning) throw new Error("Not ready");

      const trimmed = command.trim();
      setIsRunning(true);

      try {
        const res = await fetch(`${API}/terminal/exec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, command: trimmed }),
        });

        const data = await res.json();

        const entry: HistoryEntry = {
          command: trimmed,
          output: res.ok ? (data.output ?? "") : (data.error ?? "Unknown error"),
          exitCode: res.ok ? (data.exitCode ?? 0) : 1,
          cwd,
          timestamp: Date.now(),
        };

        if (res.ok && data.cwd) {
          setCwd(data.cwd);
        }

        if (res.status === 404) {
          setConnectError("Session expired. Reconnecting...");
          setSessionId(null);
          sessionRef.current = null;
          createSession();
        }

        setHistory((prev) => [...prev, entry]);
        return entry;
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, cwd, createSession]
  );

  const clearHistory = useCallback(() => setHistory([]), []);

  return {
    sessionId,
    cwd,
    history,
    isRunning,
    isConnecting,
    connectError,
    exec,
    clearHistory,
    reconnect: createSession,
  };
}
