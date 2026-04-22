import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "@/lib/storage";

const LEXI_CONFIG_KEY = "lexi_self_config";

interface LexiConfig {
  customAdditions: string[];
  lastUpdated: string | null;
}

const defaultConfig: LexiConfig = { customAdditions: [], lastUpdated: null };

export const SELF_UPDATE_TRIGGERS = [
  /\b(remember this about yourself)\b/i,
  /\b(add this to yourself)\b/i,
  /\b(incorporate this into yourself)\b/i,
  /\b(update yourself)\b/i,
  /\b(make this part of (your|you))\b/i,
  /\b(change your base)\b/i,
  /\b(modify yourself)\b/i,
  /\b(self[- ]update)\b/i,
  /\b(add to your (base|coding|core|self))\b/i,
  /\b(remember (this|that) (about|for) yourself)\b/i,
  /\b(incorporate (this|that) into (your|yourself))\b/i,
  /\b(from now on[,.]? you (are|will|should|must))\b/i,
  /\b(always (be|act|respond|remember) (like|as|that))\b/i,
];

export function isSelfUpdateRequest(message: string): boolean {
  return SELF_UPDATE_TRIGGERS.some((p) => p.test(message));
}

export function useLexiConfig() {
  const [config, setConfig] = useState<LexiConfig>(defaultConfig);
  const cfgRef = useRef(defaultConfig);

  useEffect(() => {
    storage.getJSON<LexiConfig>(LEXI_CONFIG_KEY, defaultConfig).then((c) => {
      cfgRef.current = c;
      setConfig(c);
    });
  }, []);

  const persist = (next: LexiConfig) => {
    cfgRef.current = next;
    setConfig(next);
    storage.setJSON(LEXI_CONFIG_KEY, next);
  };

  const addInstruction = useCallback((instruction: string) => {
    persist({
      customAdditions: [...cfgRef.current.customAdditions, instruction.trim()],
      lastUpdated: new Date().toISOString(),
    });
  }, []);

  const removeInstruction = useCallback((index: number) => {
    persist({
      customAdditions: cfgRef.current.customAdditions.filter((_, i) => i !== index),
      lastUpdated: new Date().toISOString(),
    });
  }, []);

  const clearInstructions = useCallback(() => persist({ ...defaultConfig }), []);

  const getEnhancedSystemPrompt = useCallback((basePrompt: string) => {
    const cfg = cfgRef.current;
    if (cfg.customAdditions.length === 0) return basePrompt;
    const additions = cfg.customAdditions.map((a, i) => `${i + 1}. ${a}`).join("\n");
    return `${basePrompt}\n\n=== LEXI SELF-MODIFICATIONS (permanently incorporated) ===\nThe following instructions have been permanently added to your base by the user and MUST be followed at all times:\n${additions}`;
  }, []);

  return { config, addInstruction, removeInstruction, clearInstructions, getEnhancedSystemPrompt };
}
