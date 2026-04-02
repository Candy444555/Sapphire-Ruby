import { useState, useRef, useCallback } from "react";

const API = "/api";

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface SshState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  host: string | null;
  username: string | null;
  sessionId: string | null;
}

export function useSsh() {
  const [state, setState] = useState<SshState>({
    connected: false,
    connecting: false,
    error: null,
    host: null,
    username: null,
    sessionId: null,
  });

  const sessionRef = useRef<string | null>(null);

  const connect = useCallback(async (config: SshConfig): Promise<void> => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    if (sessionRef.current) {
      try {
        await fetch(`${API}/terminal/ssh/session/${sessionRef.current}`, { method: "DELETE" });
      } catch { /* ignore */ }
      sessionRef.current = null;
    }

    const res = await fetch(`${API}/terminal/ssh/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    const data = await res.json();

    if (!res.ok) {
      setState((s) => ({
        ...s,
        connecting: false,
        connected: false,
        error: data.error ?? "Connection failed",
      }));
      throw new Error(data.error ?? "Connection failed");
    }

    sessionRef.current = data.sessionId;
    setState({
      connected: true,
      connecting: false,
      error: null,
      host: data.host,
      username: data.username,
      sessionId: data.sessionId,
    });
  }, []);

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await fetch(`${API}/terminal/ssh/session/${sessionRef.current}`, { method: "DELETE" });
      } catch { /* ignore */ }
      sessionRef.current = null;
    }
    setState({
      connected: false,
      connecting: false,
      error: null,
      host: null,
      username: null,
      sessionId: null,
    });
  }, []);

  const exec = useCallback(
    async (
      command: string
    ): Promise<{ output: string; exitCode: number; cwd: string }> => {
      const sid = sessionRef.current;
      if (!sid) throw new Error("Not connected to VPS");

      const res = await fetch(`${API}/terminal/ssh/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, command }),
      });

      const data = await res.json();

      if (res.status === 404) {
        sessionRef.current = null;
        setState((s) => ({ ...s, connected: false, error: "SSH session disconnected" }));
        throw new Error(data.error ?? "Session disconnected");
      }

      if (!res.ok) {
        throw new Error(data.error ?? "Command failed");
      }

      return data as { output: string; exitCode: number; cwd: string };
    },
    []
  );

  return { state, connect, disconnect, exec };
}
