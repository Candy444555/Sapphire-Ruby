import { Feather } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { AgentMessage as AgentMsg } from "@/hooks/useAgentChat";
import { Markdown } from "./Markdown";
import { ProjectCard } from "./ProjectCard";

export function AgentMessage({ msg }: { msg: AgentMsg }) {
  const colors = useColors();
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <View style={[styles.user, { backgroundColor: colors.primary, borderColor: colors.border }]}>
        <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 }}>
          {msg.content}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignSelf: "flex-start", maxWidth: "100%", gap: 8 }}>
      {msg.events?.map((ev, i) => {
        if (ev.type === "text") return null; // collapsed into msg.content
        if (ev.type === "cmd_start") {
          return (
            <View key={i} style={[styles.cmd, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.cmdHead}>
                <Feather name="terminal" size={12} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 }}>
                  RUN
                </Text>
              </View>
              <Text selectable style={[styles.code, { color: colors.foreground }]}>$ {ev.command}</Text>
            </View>
          );
        }
        if (ev.type === "cmd_result") {
          const ok = ev.exitCode === 0;
          return (
            <View key={i} style={[styles.cmd, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.cmdHead}>
                <Feather name={ok ? "check-circle" : "x-circle"} size={12} color={ok ? "#3fb950" : colors.destructive} />
                <Text style={{ color: ok ? "#3fb950" : colors.destructive, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 }}>
                  {ok ? "OK" : `EXIT ${ev.exitCode}`}
                </Text>
              </View>
              <ScrollView horizontal>
                <Text selectable style={[styles.code, { color: colors.mutedForeground }]}>
                  {ev.output || "(no output)"}
                </Text>
              </ScrollView>
            </View>
          );
        }
        if (ev.type === "self_patch") {
          return (
            <View key={i} style={[styles.event, { backgroundColor: "#3a206b", borderColor: colors.accent }]}>
              <Feather name="zap" size={14} color={colors.accent} />
              <Text style={[styles.eventText, { color: colors.foreground }]}>
                <Text style={{ fontFamily: "Inter_700Bold" }}>FUSED:</Text> {ev.name} — {ev.description}
              </Text>
            </View>
          );
        }
        if (ev.type === "self_patch_error") {
          return (
            <View key={i} style={[styles.event, { backgroundColor: "rgba(248,81,73,0.15)", borderColor: colors.destructive }]}>
              <Feather name="alert-triangle" size={14} color={colors.destructive} />
              <Text style={[styles.eventText, { color: colors.foreground }]}>
                FUSE FAILED: {ev.name} — {ev.error}
              </Text>
            </View>
          );
        }
        if (ev.type === "project_complete") {
          return (
            <ProjectCard
              key={i}
              projectId={ev.projectId}
              name={ev.name}
              mainFile={ev.mainFile}
              projectType={ev.projectType}
            />
          );
        }
        if (ev.type === "needs_input") {
          return (
            <View key={i} style={[styles.event, { backgroundColor: "rgba(88,166,255,0.15)", borderColor: colors.primary }]}>
              <Feather name="help-circle" size={14} color={colors.primary} />
              <Text style={[styles.eventText, { color: colors.foreground }]}>{ev.question}</Text>
            </View>
          );
        }
        if (ev.type === "done") {
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Feather name="check" size={12} color="#3fb950" />
              <Text style={{ color: "#3fb950", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1 }}>DONE</Text>
            </View>
          );
        }
        return null;
      })}
      {msg.content ? (
        <View style={[styles.assist, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Markdown content={msg.content} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  user: {
    alignSelf: "flex-end",
    maxWidth: "92%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  assist: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, borderRadius: 16, borderWidth: 1, overflow: "visible" },
  cmd: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  cmdHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  code: { fontFamily: "Courier", fontSize: 12, lineHeight: 18 },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  eventText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18 },
});
