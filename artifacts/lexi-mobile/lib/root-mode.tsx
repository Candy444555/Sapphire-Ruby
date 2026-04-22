import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { storage } from "./storage";

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
    storage.getString(KEY, "0").then((v) => setEnabledState(v === "1"));
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    storage.setString(KEY, v ? "1" : "0");
  };

  return <Ctx.Provider value={{ enabled, setEnabled }}>{children}</Ctx.Provider>;
}

export function useRootMode() {
  return useContext(Ctx);
}
