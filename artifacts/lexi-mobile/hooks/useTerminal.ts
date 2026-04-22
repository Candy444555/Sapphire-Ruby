import { useState, useRef, useCallback, useEffect } from "react";
import { termCreateSession, termDestroySession, termExec } from "@/lib/lexi-api";

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
      const data = await termCreateSession();
      setSessionId(data.sessionId);
      setCwd(data.cwd ?? "/root");
      sessionRef.current = data.sessionId;
      setIsConnecting(false);
      return data.sessionId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setConnectError(msg);
      setIsConnecting(false);
      throw err;
    }
  }, []);

  useEffect(() => {
    createSession();
    return () => {
      if (sessionRef.current) termDestroySession(sessionRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = useCallback(
    async (command: string): Promise<HistoryEntry> => {
      const sid = sessionRef.current;
      if (!sid || isRunning) throw new Error("Not ready");
      const trimmed = command.trim();
      setIsRunning(true);
      try {
        const data = await termExec(sid, trimmed);
        const entry: HistoryEntry = {
          command: trimmed,
          output: data.ok ? (data.output ?? "") : (data.error ?? "Unknown error"),
          exitCode: data.ok ? (data.exitCode ?? 0) : 1,
          cwd,
          timestamp: Date.now(),
        };
        if (data.ok && data.cwd) setCwd(data.cwd);
        if (data.status === 404) {
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
    [isRunning, cwd, createSession],
  );

  const clearHistory = useCallback(() => setHistory([]), []);

  return { sessionId, cwd, history, isRunning, isConnecting, connectError, exec, clearHistory, reconnect: createSession };
}
