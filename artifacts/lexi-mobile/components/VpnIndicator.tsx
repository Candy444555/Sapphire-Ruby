import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { vpnRotate, vpnStatus } from "@/lib/lexi-api";

export function VpnIndicator() {
  const colors = useColors();
  const [info, setInfo] = useState<{ enabled?: boolean; ip?: string; country?: string } | null>(null);
  const [rotating, setRotating] = useState(false);

  const fetchStatus = async () => setInfo(await vpnStatus());

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30000);
    return () => clearInterval(id);
  }, []);

  const onRotate = async () => {
    setRotating(true);
    try { await vpnRotate(); await fetchStatus(); } finally { setRotating(false); }
  };

  const on = !!info?.enabled;
  return (
    <Pressable onPress={onRotate} disabled={!on || rotating} style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
      <Feather name="globe" size={12} color={on ? "#3fb950" : colors.mutedForeground} />
      <Text style={{ color: on ? colors.foreground : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1 }}>
        {on ? `${info?.ip ?? "?"} · ${info?.country ?? "??"}` : "VPN OFF"}
      </Text>
      {on && <Feather name="refresh-cw" size={10} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
});
