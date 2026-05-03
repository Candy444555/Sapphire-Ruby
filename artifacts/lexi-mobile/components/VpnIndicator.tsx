import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getApiBase, vpnRotate, vpnStatus } from "@/lib/lexi-api";

interface TorInfo {
  enabled?: boolean;
  active?: boolean;
  torReady?: boolean;
  bootstrapPct?: number;
  ip?: string | null;
  country?: string | null;
  totalRotations?: number;
}

export function VpnIndicator() {
  const colors = useColors();
  const [info, setInfo] = useState<TorInfo | null>(null);
  const [rotating, setRotating] = useState(false);

  const fetchStatus = async () => {
    if (!getApiBase()) return;
    const v = await vpnStatus();
    if (v) setInfo(v);
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, []);

  const on = !!(info?.enabled || info?.active || info?.torReady);
  const booting = !on && !!info && (info.bootstrapPct ?? 0) > 0;

  const onRotate = async () => {
    if (!on || rotating) return;
    setRotating(true);
    try { await vpnRotate(); await fetchStatus(); } finally { setRotating(false); }
  };

  const label = () => {
    if (!getApiBase()) return "VPN OFF";
    if (booting) return `TOR ${info?.bootstrapPct ?? 0}%`;
    if (!on) return "VPN OFF";
    const ip = info?.ip;
    const cc = info?.country;
    return ip ? `${ip} · ${cc ?? "??"}` : `TOR ON · ${cc ?? "??"}`;
  };

  return (
    <Pressable
      onPress={onRotate}
      disabled={!on || rotating}
      style={[styles.wrap, { borderColor: on ? "#3fb95044" : colors.border, backgroundColor: colors.muted }]}
    >
      <Feather name="globe" size={12} color={on ? "#3fb950" : booting ? colors.primary : colors.mutedForeground} />
      <Text style={{ color: on ? colors.foreground : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1 }}>
        {label()}
      </Text>
      {on && (
        <Feather name={rotating ? "loader" : "refresh-cw"} size={10} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
});
