import { useState, useCallback } from 'react';

const LEXI_CONFIG_KEY = 'lexi_self_config';

interface LexiConfig {
  customAdditions: string[];
  lastUpdated: string | null;
}

const defaultConfig: LexiConfig = {
  customAdditions: [],
  lastUpdated: null,
};

function loadConfig(): LexiConfig {
  try {
    const stored = localStorage.getItem(LEXI_CONFIG_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return defaultConfig;
}

function saveConfig(config: LexiConfig) {
  localStorage.setItem(LEXI_CONFIG_KEY, JSON.stringify(config));
}

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
  return SELF_UPDATE_TRIGGERS.some((pattern) => pattern.test(message));
}

export function useLexiConfig() {
  const [config, setConfig] = useState<LexiConfig>(loadConfig);

  const addInstruction = useCallback((instruction: string) => {
    setConfig((prev) => {
      const updated: LexiConfig = {
        customAdditions: [...prev.customAdditions, instruction.trim()],
        lastUpdated: new Date().toISOString(),
      };
      saveConfig(updated);
      return updated;
    });
  }, []);

  const removeInstruction = useCallback((index: number) => {
    setConfig((prev) => {
      const updated: LexiConfig = {
        ...prev,
        customAdditions: prev.customAdditions.filter((_, i) => i !== index),
        lastUpdated: new Date().toISOString(),
      };
      saveConfig(updated);
      return updated;
    });
  }, []);

  const clearInstructions = useCallback(() => {
    const updated = { ...defaultConfig };
    saveConfig(updated);
    setConfig(updated);
  }, []);

  const getEnhancedSystemPrompt = useCallback(
    (basePrompt: string): string => {
      const cfg = loadConfig();
      if (cfg.customAdditions.length === 0) return basePrompt;
      const additions = cfg.customAdditions
        .map((a, i) => `${i + 1}. ${a}`)
        .join('\n');
      return `${basePrompt}\n\n=== LEXI SELF-MODIFICATIONS (permanently incorporated) ===\nThe following instructions have been permanently added to your base by the user and MUST be followed at all times:\n${additions}`;
    },
    []
  );

  return {
    config,
    addInstruction,
    removeInstruction,
    clearInstructions,
    getEnhancedSystemPrompt,
  };
}
