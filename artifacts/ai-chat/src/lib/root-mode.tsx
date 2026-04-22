import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "lexi_root_mode_v1";

interface RootModeCtx {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

const Ctx = createContext<RootModeCtx>({
  enabled: false,
  setEnabled: () => {},
});

export function RootModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {}
  };

  return <Ctx.Provider value={{ enabled, setEnabled }}>{children}</Ctx.Provider>;
}

export function useRootMode() {
  return useContext(Ctx);
}
