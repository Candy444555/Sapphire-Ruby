import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getApiBase, vpnStatus } from "@/lib/lexi-api";

interface TorInfo {
  enabled?: boolean;
  active?: boolean;
  torReady?: boolean;
  bootstrapPct?: number;
  country?: string | null;
}

export function TorStatus() {
  const colors = useColors();
  const [info, setInfo] = useState<TorInfo | null>(null);

  useEffect(() => {
    if (!getApiBase()) return;
    let alive = true;
    const tick = async () => {
      const v = await vpnStatus();
      if (!alive) return;
      if (v) setInfo(v);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const on = !!(info?.enabled || info?.active || info?.torReady);
  const booting = !on && !!info && (info.bootstrapPct ?? 0) > 0;
  const noServer = !getApiBase();

  const label = () => {
    if (noServer) return "DIRECT";
    if (booting) return `BOOT ${info?.bootstrapPct ?? 0}%`;
    if (!on) return "DIRECT";
    return `TOR · ${info?.country ?? "??"}`;
  };

  const color = on ? "#3fb950" : booting ? colors.primary : colors.mutedForeground;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.muted, borderColor: on ? "#3fb95044" : colors.border }]}>
      <Feather name="shield" size={12} color={color} />
      <Text style={{ color, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 }}>
        {label()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
});
