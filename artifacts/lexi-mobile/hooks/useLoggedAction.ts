import { useCallback, useRef } from "react";

import { log, newCorrelationId, type Actor } from "@/lib/logger";

export type LoggedActionOptions = {
  category?: string;
  actor?: Actor;
  target?: string;
};

export function useLoggedAction(name: string, opts: LoggedActionOptions = {}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  return useCallback(
    async <T,>(fn: () => Promise<T> | T, payload?: { inputs?: unknown; target?: string }): Promise<T> => {
      const o = optsRef.current;
      const cid = newCorrelationId();
      const start = Date.now();
      log.debug(o.category ?? "ui", `${name}:start`, {
        actor: o.actor ?? "user",
        target: payload?.target ?? o.target,
        inputs: payload?.inputs,
        correlationId: cid,
      });
      try {
        const out = await fn();
        log.info(o.category ?? "ui", `${name}:end`, {
          actor: o.actor ?? "user",
          target: payload?.target ?? o.target,
          correlationId: cid,
          durationMs: Date.now() - start,
          status: "ok",
        });
        return out;
      } catch (err) {
        log.error(o.category ?? "ui", `${name}:end`, {
          actor: o.actor ?? "user",
          target: payload?.target ?? o.target,
          correlationId: cid,
          durationMs: Date.now() - start,
          status: "error",
          error: err,
        });
        throw err;
      }
    },
    [name],
  );
}
