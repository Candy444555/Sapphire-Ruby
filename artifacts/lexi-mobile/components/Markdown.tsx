import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface MarkdownProps {
  content: string;
}

type Block =
  | { kind: "code"; lang: string; text: string }
  | { kind: "para"; text: string };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```([\w+-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    if (m.index > last) blocks.push({ kind: "para", text: content.slice(last, m.index) });
    blocks.push({ kind: "code", lang: m[1] || "code", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) blocks.push({ kind: "para", text: content.slice(last) });
  return blocks;
}

export const Markdown = React.memo(function Markdown({ content }: MarkdownProps) {
  const colors = useColors();
  const blocks = useMemo(() => parseBlocks(content), [content]);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <CodeBlock key={i} lang={b.lang} text={b.text} />
        ) : (
          <Paragraph key={i} text={b.text} color={colors.foreground} linkColor={colors.primary} />
        ),
      )}
    </View>
  );
});

function Paragraph({ text, color, linkColor }: { text: string; color: string; linkColor: string }) {
  // Split inline `code`, **bold**, *em*, [text](url), and URLs.
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))|(https?:\/\/\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(<Text key={key++} style={styles.inlineCode}>{tok.slice(1, -1)}</Text>);
    } else if (tok.startsWith("**")) {
      parts.push(<Text key={key++} style={{ fontFamily: "Inter_700Bold" }}>{tok.slice(2, -2)}</Text>);
    } else if (tok.startsWith("*")) {
      parts.push(<Text key={key++} style={{ fontStyle: "italic" }}>{tok.slice(1, -1)}</Text>);
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      parts.push(
        <Text key={key++} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => Linking.openURL(mm[2])}>
          {mm[1]}
        </Text>,
      );
    } else {
      parts.push(
        <Text key={key++} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => Linking.openURL(tok)}>
          {tok}
        </Text>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Text style={{ color, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 }}>{parts}</Text>;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={[styles.codeWrap, { borderColor: colors.border }]}>
      <View style={[styles.codeHead, { backgroundColor: "#1e1e1e" }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>
          {lang}
        </Text>
        <Pressable onPress={copy} hitSlop={8}>
          <Feather name={copied ? "check" : "copy"} size={14} color={copied ? "#3fb950" : colors.mutedForeground} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={[styles.codeText, { color: "#e6edf3" }]}>{text}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineCode: {
    fontFamily: "Courier",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 13,
  },
  codeWrap: { borderRadius: 10, overflow: "hidden", borderWidth: 1, marginHorizontal: -14 },
  codeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  codeText: {
    fontFamily: "Courier",
    fontSize: 13,
    padding: 12,
    backgroundColor: "#121212",
    minWidth: "100%",
  },
});
