import { useState, useRef, useCallback } from "react";
import { sshConnect as apiConnect, sshDisconnect, sshExec } from "@/lib/lexi-api";

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
    connected: false, connecting: false, error: null, host: null, username: null, sessionId: null,
  });
  const sessionRef = useRef<string | null>(null);

  const connect = useCallback(async (config: SshConfig) => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    if (sessionRef.current) {
      await sshDisconnect(sessionRef.current);
      sessionRef.current = null;
    }
    try {
      const data = await apiConnect(config);
      sessionRef.current = data.sessionId;
      setState({
        connected: true, connecting: false, error: null,
        host: data.host, username: data.username, sessionId: data.sessionId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setState((s) => ({ ...s, connecting: false, connected: false, error: msg }));
      throw err;
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
      await sshDisconnect(sessionRef.current);
      sessionRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null, host: null, username: null, sessionId: null });
  }, []);

  const exec = useCallback(async (command: string) => {
    const sid = sessionRef.current;
    if (!sid) throw new Error("Not connected to VPS");
    try {
      return await sshExec(sid, command);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Command failed";
      if (msg.toLowerCase().includes("disconnect") || msg.toLowerCase().includes("session")) {
        sessionRef.current = null;
        setState((s) => ({ ...s, connected: false, error: msg }));
      }
      throw err;
    }
  }, []);

  return { state, connect, disconnect, exec };
}
