import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const KEY = "lexi_root_mode_v1";

interface RootModeCtx {
  enabled: boolean;
  ready: boolean;
  setEnabled: (v: boolean) => Promise<void>;
}

const Ctx = createContext<RootModeCtx>({
  enabled: false,
  ready: false,
  setEnabled: async () => {},
});

export function RootModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(KEY);
        setEnabledState(v === "1");
      } catch {}
      setReady(true);
    })();
  }, []);

  const setEnabled = async (v: boolean) => {
    setEnabledState(v);
    try {
      await AsyncStorage.setItem(KEY, v ? "1" : "0");
    } catch {}
  };

  return <Ctx.Provider value={{ enabled, ready, setEnabled }}>{children}</Ctx.Provider>;
}

export function useRootMode() {
  return useContext(Ctx);
}
