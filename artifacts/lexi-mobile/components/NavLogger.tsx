import { usePathname, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { log } from "@/lib/logger";

export function NavLogger() {
  const path = usePathname();
  const segments = useSegments();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === path) return;
    log.info("nav", "route", {
      actor: "user",
      target: path,
      inputs: { segments },
      status: last.current ? "transition" : "initial",
    });
    last.current = path;
  }, [path, segments]);
  return null;
}
