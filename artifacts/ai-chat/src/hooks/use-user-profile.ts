import { useState, useCallback, useRef } from 'react';

const PROFILE_KEY = 'lexi_user_profile';

export interface UserProfile {
  messageCount: number;
  wordFrequency: Record<string, number>;
  avgMessageLength: number;
  usesLowercase: boolean;
  usesPunctuation: boolean;
  usesContractions: boolean;
  casualMarkers: number;
  commonPhrases: string[];
  topicsDetected: string[];
  communicationStyle: 'casual' | 'technical' | 'formal' | 'mixed';
  lastUpdated: string;
}

const defaultProfile: UserProfile = {
  messageCount: 0,
  wordFrequency: {},
  avgMessageLength: 0,
  usesLowercase: true,
  usesPunctuation: false,
  usesContractions: true,
  casualMarkers: 0,
  commonPhrases: [],
  topicsDetected: [],
  communicationStyle: 'casual',
  lastUpdated: new Date().toISOString(),
};

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','is',
  'are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','i','you','it','this',
  'that','they','we','he','she','me','my','your','his','her','its','our',
  'their','what','which','who','how','when','where','why','so','if','then',
  'than','as','up','out','about','into','just','also','not','no','yes',
]);

const CASUAL_MARKERS = [
  /\b(gonna|wanna|gotta|kinda|sorta|dunno|lemme|gimme|lol|lmao|btw|tbh|ngl|imo|omg|wtf|fyi)\b/i,
  /\.{2,}/,
  /!{2,}/,
  /[a-z][A-Z]/,
];

const TECHNICAL_MARKERS = [
  /\b(sudo|chmod|grep|bash|python|script|code|function|variable|api|server|port|ip|ssh|sql|git|npm|pip|docker|kernel|process|daemon)\b/i,
];

const TOPIC_PATTERNS: Record<string, RegExp> = {
  'security & hacking': /\b(hack|exploit|scan|nmap|payload|shell|root|privilege|vpn|tor|proxy|pentest|ctf|vuln|injection|xss|csrf|rce|lfi|rfi)\b/i,
  'networking': /\b(network|ip|port|tcp|udp|dns|http|ssh|ftp|packet|firewall|router|subnet)\b/i,
  'programming': /\b(code|script|python|javascript|typescript|function|variable|loop|array|class|api|debug|compile)\b/i,
  'system admin': /\b(linux|windows|server|service|daemon|process|cpu|memory|disk|mount|cron|systemd|package|install)\b/i,
  'osint & research': /\b(research|find|search|investigate|lookup|username|email|phone|social|track|gather|recon)\b/i,
};

function loadProfile(): UserProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) return { ...defaultProfile, ...JSON.parse(stored) };
  } catch {}
  return { ...defaultProfile };
}

function saveProfile(profile: UserProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

function detectTopics(message: string, existing: string[]): string[] {
  const found = new Set(existing);
  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
    if (pattern.test(message)) found.add(topic);
  }
  return Array.from(found).slice(0, 8);
}

function analyzeMessage(message: string, prev: UserProfile): UserProfile {
  const words = message.toLowerCase().match(/\b[a-z']{2,}\b/g) ?? [];
  const newFreq = { ...prev.wordFrequency };

  for (const word of words) {
    if (!STOP_WORDS.has(word)) {
      newFreq[word] = (newFreq[word] ?? 0) + 1;
    }
  }

  const totalMessages = prev.messageCount + 1;
  const newAvgLen = Math.round(
    (prev.avgMessageLength * prev.messageCount + message.length) / totalMessages
  );

  const startsLowercase = /^[a-z]/.test(message.trim());
  const hasPeriod = /[.!?]$/.test(message.trim());
  const hasContraction = /\b\w+'(t|s|d|ll|re|ve|m)\b/i.test(message);
  const casualCount = CASUAL_MARKERS.filter(p => p.test(message)).length;
  const technicalCount = TECHNICAL_MARKERS.filter(p => p.test(message)).length;

  const totalCasual = prev.casualMarkers + casualCount;

  // Top phrases: words used 3+ times
  const topPhrases = Object.entries(newFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  const topics = detectTopics(message, prev.topicsDetected);

  // Determine communication style
  let style: UserProfile['communicationStyle'] = 'mixed';
  if (totalCasual > totalMessages * 0.3) style = 'casual';
  else if (technicalCount > 0 && totalMessages > 3) style = 'technical';
  else if (!startsLowercase && hasPeriod) style = 'formal';

  return {
    messageCount: totalMessages,
    wordFrequency: newFreq,
    avgMessageLength: newAvgLen,
    usesLowercase: startsLowercase,
    usesPunctuation: hasPeriod,
    usesContractions: hasContraction,
    casualMarkers: totalCasual,
    commonPhrases: topPhrases,
    topicsDetected: topics,
    communicationStyle: style,
    lastUpdated: new Date().toISOString(),
  };
}

export function buildUserProfilePrompt(profile: UserProfile): string {
  if (profile.messageCount < 2) return '';

  const lines: string[] = [];
  lines.push(`=== USER DNA (auto-learned — mirror this exactly) ===`);
  lines.push(`Messages analyzed: ${profile.messageCount}`);
  lines.push(`Communication style: ${profile.communicationStyle}`);
  lines.push(`Avg message length: ${profile.avgMessageLength} chars (${profile.avgMessageLength < 40 ? 'very short' : profile.avgMessageLength < 100 ? 'short' : profile.avgMessageLength < 250 ? 'medium' : 'long'})`);

  if (!profile.usesLowercase) lines.push(`Writing: uses capitalization`);
  else lines.push(`Writing: lowercase/no caps style`);

  if (!profile.usesPunctuation) lines.push(`Punctuation: minimal — no periods at end`);
  if (profile.usesContractions) lines.push(`Uses contractions and informal language`);

  if (profile.commonPhrases.length > 0) {
    lines.push(`Their vocab: ${profile.commonPhrases.slice(0, 12).join(', ')}`);
  }

  if (profile.topicsDetected.length > 0) {
    lines.push(`Their interests: ${profile.topicsDetected.join(', ')}`);
  }

  lines.push(``);
  lines.push(`Adapt completely to this user's style. Match their energy, vocabulary, and message length. If they're casual and short — be casual and short. If they're technical — be technical. Mirror how they write.`);

  return lines.join('\n');
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const profileRef = useRef<UserProfile>(profile);
  profileRef.current = profile;

  const learnFromMessage = useCallback((message: string) => {
    const updated = analyzeMessage(message, profileRef.current);
    profileRef.current = updated;
    saveProfile(updated);
    setProfile(updated);
  }, []);

  const resetProfile = useCallback(() => {
    const fresh = { ...defaultProfile };
    saveProfile(fresh);
    setProfile(fresh);
  }, []);

  const getProfilePrompt = useCallback((): string => {
    return buildUserProfilePrompt(profileRef.current);
  }, []);

  return {
    profile,
    learnFromMessage,
    resetProfile,
    getProfilePrompt,
  };
}
