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
  const fence = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    if (m.index > last) pushParaBlocks(blocks, content.slice(last, m.index));
    blocks.push({ kind: "code", lang: m[1] || "code", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) pushParaBlocks(blocks, content.slice(last));
  return blocks;
}

// Split on blank-line paragraph breaks so each paragraph renders as its own
// Text block with vertical spacing — otherwise multi-paragraph answers all
// run together visually as one wall of text.
function pushParaBlocks(blocks: Block[], chunk: string) {
  const paragraphs = chunk.split(/\n{2,}/);
  for (const p of paragraphs) {
    const trimmed = p.replace(/^\n+|\n+$/g, "");
    if (trimmed) blocks.push({ kind: "para", text: trimmed });
  }
}

export const Markdown = React.memo(function Markdown({ content }: MarkdownProps) {
  const colors = useColors();
  const blocks = useMemo(() => parseBlocks(content), [content]);
  return (
    <View style={{ gap: 10 }}>
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

// Render a single paragraph. Soft `\n` becomes a real line break inside the
// paragraph's <Text>. Inline markdown (code, bold, italic, links) is parsed
// per-line so a malformed token can't swallow whitespace across lines.
function Paragraph({ text, color, linkColor }: { text: string; color: string; linkColor: string }) {
  const lines = text.split("\n");
  const children: React.ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) children.push("\n");
    const parts = renderInline(line, linkColor);
    for (let j = 0; j < parts.length; j++) {
      children.push(<React.Fragment key={`${idx}-${j}`}>{parts[j]}</React.Fragment>);
    }
  });
  return (
    <Text selectable style={{ color, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 }}>
      {children}
    </Text>
  );
}

// Returns an array of strings / Text nodes for inline markdown. Whitespace is
// preserved verbatim — we never trim around matched tokens, so words can't be
// bunched together by the parser.
function renderInline(line: string, linkColor: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\n]+\))|(https?:\/\/\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(<Text key={`c${key++}`} style={styles.inlineCode}>{tok.slice(1, -1)}</Text>);
    } else if (tok.startsWith("**")) {
      out.push(<Text key={`b${key++}`} style={{ fontFamily: "Inter_700Bold" }}>{tok.slice(2, -2)}</Text>);
    } else if (tok.startsWith("*")) {
      out.push(<Text key={`i${key++}`} style={{ fontStyle: "italic" }}>{tok.slice(1, -1)}</Text>);
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(
        <Text key={`l${key++}`} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => Linking.openURL(mm[2])}>
          {mm[1]}
        </Text>,
      );
    } else {
      out.push(
        <Text key={`u${key++}`} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => Linking.openURL(tok)}>
          {tok}
        </Text>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  if (out.length === 0) out.push(line);
  return out;
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
