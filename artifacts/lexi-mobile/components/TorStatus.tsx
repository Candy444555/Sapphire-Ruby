import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getApiBase, vpnStatus } from "@/lib/lexi-api";

export function TorStatus() {
  const colors = useColors();
  const [info, setInfo] = useState<{ enabled?: boolean; ip?: string; country?: string } | null>(null);

  useEffect(() => {
    if (!getApiBase()) return;
    let alive = true;
    const tick = async () => {
      const v = await vpnStatus();
      if (!alive) return;
      setInfo(v);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!getApiBase()) return null;

  const on = !!info?.enabled;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Feather name="shield" size={12} color={on ? "#3fb950" : colors.mutedForeground} />
      <Text style={{ color: on ? "#3fb950" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 }}>
        {on ? `TOR · ${info?.country ?? "??"}` : "DIRECT"}
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
