import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { AgentMessage as AgentMsg } from "@/hooks/useAgentChat";
import { Markdown } from "./Markdown";
import { ProjectCard } from "./ProjectCard";

interface AgentMessageProps {
  msg: AgentMsg;
  onRunCommand?: (command: string) => void;
  onCancelCommand?: (command: string) => void;
}

export function AgentMessage({
  msg,
  onRunCommand,
  onCancelCommand,
}: AgentMessageProps) {
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
        if (ev.type === "cmd_pending") {
          return (
            <View key={i} style={[styles.cmd, { borderColor: colors.accent, backgroundColor: colors.muted }]}>
              <View style={styles.cmdHead}>
                <Feather name="alert-circle" size={13} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 }}>
                  APPROVE COMMAND
                </Text>
              </View>
              <Text selectable style={[styles.code, { color: colors.foreground }]}>$ {ev.command}</Text>
              <View style={styles.commandActions}>
                <Pressable
                  onPress={() => onRunCommand?.(ev.command)}
                  accessibilityRole="button"
                  accessibilityLabel="Run this command"
                  testID="approve-agent-command"
                  style={[styles.commandButton, { backgroundColor: colors.primary }]}
                >
                  <Feather name="play" size={13} color={colors.primaryForeground} />
                  <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Run</Text>
                </Pressable>
                <Pressable
                  onPress={() => onCancelCommand?.(ev.command)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel this command"
                  testID="cancel-agent-command"
                  style={[styles.commandButton, { borderColor: colors.border, borderWidth: 1 }]}
                >
                  <Feather name="x" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          );
        }
        if (ev.type === "cmd_cancelled") {
          return (
            <View key={i} style={[styles.event, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="slash" size={14} color={colors.mutedForeground} />
              <Text style={[styles.eventText, { color: colors.mutedForeground }]}>Command canceled; it was not run.</Text>
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
        if (ev.type === "tool_error" || ev.type === "error") {
          const message = ev.type === "tool_error" ? `${ev.tool}: ${ev.error}` : ev.message;
          return (
            <View key={i} style={[styles.event, { backgroundColor: "rgba(248,81,73,0.15)", borderColor: colors.destructive }]}>
              <Feather name="alert-triangle" size={14} color={colors.destructive} />
              <Text style={[styles.eventText, { color: colors.foreground }]}>{message}</Text>
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
  commandActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  commandButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 8 },
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
