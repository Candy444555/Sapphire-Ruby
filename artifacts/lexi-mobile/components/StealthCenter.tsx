// Stealth card v2 + Operator-eyes drawer + Guardrails tab.
//
// Replaces the old single-toggle Stealth section in Profile. Three subtabs:
//   - Stealth: backend selector, profile selector + lock, pacing preset,
//     live verifier (real IP / exit IP / circuit / fingerprint hash /
//     header-coherence score / backend health).
//   - Operator-eyes: chronological event drawer showing every request,
//     response, backend switch, guardrail hit and shadow-hit. No telemetry
//     suppression on this side.
//   - Guardrails: starter-pack switch panel, plain-English rule editor,
//     raw-TS editor, list of registered rules.

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { isStealth, setStealth, getEngine, setEngine } from "@/lib/stealth-fetch";
import {
  getActiveBackend,
  setActiveBackend,
  getPriority,
  setPriority,
  getProxies,
  setProxies,
  type BackendKey,
} from "@/lib/stealth/backends";
import { listProfiles, getActiveProfile, setActiveProfile, isProfileLocked, setProfileLocked, coherenceScore } from "@/lib/stealth/profiles";
import { getPacerPreset, setPacerPreset, type PacerPreset } from "@/lib/stealth/pacer";
import { snapshot, type VerifierSnapshot } from "@/lib/stealth/verifier";
import { getOpsBuffer, subscribeOps, clearOpsBuffer, type OpsEvent } from "@/lib/stealth/operator-eyes";
import {
  registerGuard,
  listGuards,
  enableGuard,
  disableGuard,
  removeGuard,
  type Guard,
  type ActionDescriptor,
} from "@/lib/ops/guardrails";
import { STARTERS, setStarterEnabled, type StarterId } from "@/lib/ops/starter-pack";
import { armBurnAfterRead } from "@/lib/stealth/budget";

type Tab = "stealth" | "ops-eyes" | "guardrails";

const BACKENDS: { key: BackendKey; label: string }[] = [
  { key: "tor", label: "Embedded Tor" },
  { key: "tor-rotate", label: "Tor + NEWNYM/req" },
  { key: "direct", label: "Direct" },
  { key: "residential", label: "Residential proxy" },
  { key: "mobile", label: "Mobile proxy" },
  { key: "wireguard", label: "WireGuard (OS-level)" },
];

const PRESETS: PacerPreset[] = ["balanced", "stealth-max", "burn-after-read"];

export function StealthCenter() {
  const colors = useColors();
  const [tab, setTab] = useState<Tab>("stealth");
  const [stealthOn, setStealthOn] = useState(isStealth());
  const [backend, setBackend] = useState<BackendKey>(getActiveBackend());
  const [profileKey, setProfileKey] = useState(getActiveProfile().key);
  const [locked, setLocked] = useState(isProfileLocked());
  const [preset, setPreset] = useState<PacerPreset>(getPacerPreset());
  const [engine, setEngineState] = useState(getEngine());
  const [snap, setSnap] = useState<VerifierSnapshot | null>(null);
  const [verifying, setVerifying] = useState(false);

  const profiles = listProfiles();
  const active = profiles.find((p) => p.key === profileKey) ?? profiles[0];
  const coherence = useMemo(() => coherenceScore(active), [active.key]);

  const refresh = async () => {
    setVerifying(true);
    try { setSnap(await snapshot()); } catch (e) { setSnap({ realIp: null, exitIp: null, isTor: false, bootstrapped: 0, circuit: [], ja3: null, ja4: null, h2: null, negotiated: null, ua: null, profileKey: active.key, errors: [String(e)] }); }
    finally { setVerifying(false); }
  };

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Feather name="eye-off" size={16} color={colors.accent} />
        <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>STEALTH CENTER (v2)</Text>
        <Pressable
          onPress={() => {
            if (stealthOn) {
              Alert.alert("Disable stealth?", "Lexi will leak your real IP. Only do this if you know what you're doing.", [
                { text: "Keep ON", style: "cancel" },
                { text: "Disable", style: "destructive", onPress: async () => { await setStealth(false); setStealthOn(false); } },
              ]);
            } else { setStealth(true); setStealthOn(true); }
          }}
          style={{ width: 44, height: 24, borderRadius: 12, padding: 2, backgroundColor: stealthOn ? "#238636" : colors.border, justifyContent: "center", alignItems: stealthOn ? "flex-end" : "flex-start" }}
        >
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
        {(["stealth", "ops-eyes", "guardrails"] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: tab === k ? colors.primary : colors.border, backgroundColor: tab === k ? colors.primary : "transparent", alignItems: "center" }}>
            <Text style={{ color: tab === k ? colors.background : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>{k === "stealth" ? "Stealth" : k === "ops-eyes" ? "Operator-eyes" : "Guardrails"}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "stealth" && (
        <View style={{ gap: 12 }}>
          <Section colors={colors} label="Backend">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {BACKENDS.map((b) => (
                <Pressable key={b.key} onPress={async () => { await setActiveBackend(b.key); setBackend(b.key); }} style={chipStyle(colors, backend === b.key)}>
                  <Text style={{ color: backend === b.key ? colors.background : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{b.label}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section colors={colors} label="Browser profile">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Lock profile per session</Text>
              <Switch value={locked} onValueChange={(v) => { setProfileLocked(v); setLocked(v); }} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {profiles.map((p) => (
                <Pressable key={p.key} onPress={() => { setActiveProfile(p.key); setProfileKey(p.key); }} style={chipStyle(colors, profileKey === p.key)}>
                  <Text style={{ color: profileKey === p.key ? colors.background : colors.foreground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: coherence.score > 80 ? colors.tint : colors.destructive, fontSize: 11, marginTop: 6 }}>
              Header coherence: {coherence.score}/100{coherence.notes.length ? ` — ${coherence.notes.join("; ")}` : ""}
            </Text>
          </Section>

          <Section colors={colors} label="Pacing">
            <View style={{ flexDirection: "row", gap: 6 }}>
              {PRESETS.map((p) => (
                <Pressable key={p} onPress={() => { setPacerPreset(p); setPreset(p); }} style={chipStyle(colors, preset === p)}>
                  <Text style={{ color: preset === p ? colors.background : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => { armBurnAfterRead(1); Alert.alert("Burn-after-read armed", "Next request uses a fresh circuit + fresh fingerprint within the locked profile family."); }} style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.destructive, alignItems: "center" }}>
              <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>Arm burn-after-read (next request)</Text>
            </Pressable>
          </Section>

          <Section colors={colors} label="Engine">
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["auto", "cronet", "curl-impersonate"] as const).map((e) => (
                <Pressable key={e} onPress={async () => { await setEngine(e); setEngineState(e); }} style={chipStyle(colors, engine === e)}>
                  <Text style={{ color: engine === e ? colors.background : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Pressable onPress={refresh} disabled={verifying} style={{ paddingVertical: 10, borderRadius: 8, backgroundColor: verifying ? colors.card : colors.primary, borderWidth: 1, borderColor: colors.primary, alignItems: "center" }}>
            <Text style={{ color: verifying ? colors.foreground : colors.background, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{verifying ? "Verifying…" : "Verify live (real IP, exit IP, fingerprint)"}</Text>
          </Pressable>

          {snap && (
            <View style={{ gap: 4, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <KV label="Real IP" value={snap.realIp ?? "—"} colors={colors} />
              <KV label="Exit IP" value={snap.exitIp ?? "—"} colors={colors} />
              <KV label="Tor ready" value={snap.isTor ? "yes" : "no"} colors={colors} good={snap.isTor} bad={!snap.isTor} />
              <KV label="JA3" value={snap.ja3 ?? "—"} colors={colors} />
              <KV label="JA4" value={snap.ja4 ?? "—"} colors={colors} />
              <KV label="HTTP/2 fp" value={snap.h2 ?? "—"} colors={colors} />
              <KV label="Negotiated" value={snap.negotiated ?? "—"} colors={colors} />
              {snap.circuit.length > 0 && (
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Circuit: {snap.circuit.map((n) => `${n.nickname}${n.country ? `(${n.country})` : ""}`).join(" → ")}</Text>
              )}
              {snap.errors.length > 0 && (
                <Text style={{ color: colors.destructive, fontSize: 10 }}>{snap.errors.join(" | ")}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {tab === "ops-eyes" && <OpsEyes colors={colors} />}
      {tab === "guardrails" && <GuardrailsTab colors={colors} />}
    </View>
  );
}

function Section({ label, colors, children }: { label: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.accent, fontSize: 10, letterSpacing: 1.5, fontFamily: "Inter_700Bold" }}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function chipStyle(colors: ReturnType<typeof useColors>, on: boolean) {
  return { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" } as const;
}

function KV({ label, value, colors, good, bad }: { label: string; value: string; colors: ReturnType<typeof useColors>; good?: boolean; bad?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: good ? colors.tint : bad ? colors.destructive : colors.foreground, fontSize: 11, fontFamily: "Inter_500Medium", maxWidth: "70%", textAlign: "right" }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function OpsEyes({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [events, setEvents] = useState<OpsEvent[]>(getOpsBuffer().slice(-100).reverse());
  useEffect(() => {
    const off = subscribeOps((e) => setEvents((prev) => [e, ...prev].slice(0, 200)));
    return off;
  }, []);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Showing latest {events.length} events. No suppression.</Text>
        <Pressable onPress={() => { clearOpsBuffer(); setEvents([]); }}>
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
        {events.map((e) => (
          <View key={e.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: kindColor(e.kind, colors), fontSize: 10, fontFamily: "Inter_700Bold" }}>{e.kind.toUpperCase()} · {new Date(e.ts).toLocaleTimeString()}</Text>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{e.title}</Text>
            {e.detail && <Text style={{ color: colors.mutedForeground, fontSize: 10 }} numberOfLines={3}>{JSON.stringify(e.detail)}</Text>}
          </View>
        ))}
        {!events.length && <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "center", padding: 20 }}>No events yet.</Text>}
      </ScrollView>
    </View>
  );
}

function kindColor(k: OpsEvent["kind"], colors: ReturnType<typeof useColors>): string {
  switch (k) {
    case "error": return colors.destructive;
    case "guardrail": return colors.accent;
    case "guardrail-shadow": return colors.mutedForeground;
    case "request": return colors.primary;
    case "response": return colors.tint;
    default: return colors.foreground;
  }
}

function GuardrailsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [guards, setGuards] = useState<Guard[]>(listGuards());
  const [plain, setPlain] = useState("");
  const [tsCode, setTsCode] = useState("");
  const refresh = () => setGuards(listGuards().slice());

  const addPlain = () => {
    if (!plain.trim()) return;
    const parsed = parsePlainEnglish(plain.trim());
    if (!parsed) { Alert.alert("Couldn't parse", "Try patterns like: 'block writes to *.prod.*' or 'confirm DELETE on api.example.com'."); return; }
    registerGuard(parsed);
    setPlain("");
    refresh();
  };

  const addRawTs = () => {
    if (!tsCode.trim()) return;
    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function(`"use strict"; return (${tsCode});`) as () => Omit<Guard, "source">;
      const g = factory();
      if (!g.name || typeof g.predicate !== "function" || typeof g.action !== "function") throw new Error("missing name/predicate/action");
      registerGuard({ ...g, source: "raw-ts", enabled: g.enabled ?? true });
      setTsCode("");
      refresh();
    } catch (e) {
      Alert.alert("Invalid rule", e instanceof Error ? e.message : "Could not evaluate");
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Section label="Starter pack (12 presets)" colors={colors}>
        {STARTERS.map((s) => {
          const on = guards.find((g) => g.name === s.id)?.enabled ?? false;
          return (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{s.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{s.description}</Text>
              </View>
              <Switch value={on} onValueChange={(v) => { setStarterEnabled(s.id as StarterId, v); refresh(); }} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
          );
        })}
      </Section>

      <Section label="Plain-English rule" colors={colors}>
        <TextInput value={plain} onChangeText={setPlain} placeholder='e.g. "block writes to *.prod.*"' placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12 }} />
        <Pressable onPress={addPlain} style={{ paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}>
          <Text style={{ color: colors.background, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Register rule</Text>
        </Pressable>
      </Section>

      <Section label="Raw TS rule" colors={colors}>
        <TextInput value={tsCode} onChangeText={setTsCode} multiline placeholder={`{ name: "no-payments", enabled: true,\n  predicate: a => /payments/.test(a.url),\n  action: a => ({ kind: "block", reason: "no payments writes" }) }`} placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 11, fontFamily: "Inter_400Regular", minHeight: 100 }} />
        <Pressable onPress={addRawTs} style={{ paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}>
          <Text style={{ color: colors.background, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Register raw rule</Text>
        </Pressable>
      </Section>

      <Section label="Active rules" colors={colors}>
        {guards.length === 0 && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>No rules registered. Engine is a no-op pass-through.</Text>}
        {guards.map((g) => (
          <View key={g.name} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, gap: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{g.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{g.source} · {g.enabled ? "enabled" : "disabled"}</Text>
            </View>
            <Pressable onPress={() => { g.enabled ? disableGuard(g.name) : enableGuard(g.name); refresh(); }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{g.enabled ? "Disable" : "Enable"}</Text>
            </Pressable>
            <Pressable onPress={() => { removeGuard(g.name); refresh(); }}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </Section>
    </View>
  );
}

// Tiny plain-English parser. Recognizes a few patterns; anything else returns
// null and the UI tells the user to try a different phrasing.
function parsePlainEnglish(text: string): Guard | null {
  const lower = text.toLowerCase();
  const matchHost = (s: string) => {
    const m = s.match(/(?:to|on|matching)\s+([^\s]+)/);
    return m?.[1];
  };
  const isWrite = (a: ActionDescriptor) => /^(POST|PUT|PATCH|DELETE)$/i.test(a.method);
  const globToRe = (g: string) => new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
  if (/^block\s+writes?\s+to\s+/.test(lower)) {
    const host = matchHost(lower);
    if (!host) return null;
    const re = globToRe(host);
    return { name: `pe:block-writes-${host}`, source: "plain-english", enabled: true, description: text, predicate: (a) => isWrite(a) && (re.test(a.target) || re.test(a.url)), action: () => ({ kind: "block", reason: `Plain rule: block writes to ${host}` }) };
  }
  if (/^confirm\s+(delete|destructive|writes?)\s+on\s+/.test(lower)) {
    const host = matchHost(lower);
    if (!host) return null;
    const re = globToRe(host);
    const onlyDelete = /confirm\s+delete/.test(lower);
    return { name: `pe:confirm-${host}`, source: "plain-english", enabled: true, description: text, predicate: (a) => (onlyDelete ? /^DELETE$/i.test(a.method) : isWrite(a)) && (re.test(a.target) || re.test(a.url)), action: (a) => ({ kind: "confirm", prompt: `Type "${a.target}" to confirm ${a.method}` }) };
  }
  if (/^log\s+(all\s+)?writes?/.test(lower)) {
    return { name: "pe:log-all-writes", source: "plain-english", enabled: true, description: text, predicate: isWrite, action: (a) => ({ kind: "log", note: `${a.method} ${a.url}` }) };
  }
  return null;
}

const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
});
