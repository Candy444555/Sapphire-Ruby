import { SocksProxyAgent } from "socks-proxy-agent";
import { randomUserAgent } from "./privacy";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface SearchBundle {
  query: string;
  results: SearchResult[];
  instantAnswer?: string;
  timestamp: string;
}

const SEARCH_TIMEOUT_MS = 6000;
const TOR_SEARCH_TIMEOUT_MS = 12000;

const SEARX_INSTANCES = [
  "https://searx.be",
  "https://search.mdosch.de",
  "https://searx.tiekoetter.com",
  "https://searxng.site",
  "https://searx.fmac.xyz",
];

async function fetchWithTimeout(url: string, init: RequestInit & { agent?: unknown }, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchSearXNG(query: string, instance: string): Promise<SearchResult[]> {
  const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en-US&safesearch=0`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": randomUserAgent(),
      "Accept": "application/json",
    },
  }, SEARCH_TIMEOUT_MS);

  if (!res.ok) throw new Error(`${instance} returned ${res.status}`);

  const data = await res.json() as {
    results?: Array<{ title?: string; url?: string; content?: string; engine?: string }>;
    answers?: string[];
    infoboxes?: Array<{ content?: string }>;
  };

  const results: SearchResult[] = (data.results ?? [])
    .filter((r) => r.url && r.title)
    .slice(0, 10)
    .map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
      source: r.engine,
    }));

  return results;
}

async function searchDuckDuckGoInstant(query: string): Promise<{ answer?: string; abstract?: string; abstractUrl?: string }> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": randomUserAgent() },
  }, SEARCH_TIMEOUT_MS);

  if (!res.ok) return {};
  const data = await res.json() as {
    Answer?: string;
    Abstract?: string;
    AbstractURL?: string;
    Heading?: string;
  };

  return {
    answer: data.Answer || undefined,
    abstract: data.Abstract || undefined,
    abstractUrl: data.AbstractURL || undefined,
  };
}

async function raceSearchInstances(query: string): Promise<SearchResult[]> {
  const shuffled = [...SEARX_INSTANCES].sort(() => Math.random() - 0.5);

  return new Promise((resolve) => {
    let settled = false;
    let failures = 0;

    for (const instance of shuffled) {
      searchSearXNG(query, instance)
        .then((results) => {
          if (!settled && results.length > 0) {
            settled = true;
            resolve(results);
          } else if (!settled) {
            failures++;
            if (failures >= shuffled.length) resolve([]);
          }
        })
        .catch(() => {
          if (!settled) {
            failures++;
            if (failures >= shuffled.length) resolve([]);
          }
        });
    }

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve([]);
      }
    }, SEARCH_TIMEOUT_MS);
  });
}

export async function searchInternet(query: string): Promise<SearchBundle> {
  const cleanQuery = query.trim().slice(0, 200);

  const [webResults, ddgData] = await Promise.allSettled([
    raceSearchInstances(cleanQuery),
    searchDuckDuckGoInstant(cleanQuery),
  ]);

  const results = webResults.status === "fulfilled" ? webResults.value : [];
  const ddg = ddgData.status === "fulfilled" ? ddgData.value : {};

  let instantAnswer: string | undefined;
  if (ddg.answer) {
    instantAnswer = ddg.answer;
  } else if (ddg.abstract) {
    instantAnswer = `${ddg.abstract}${ddg.abstractUrl ? ` (${ddg.abstractUrl})` : ""}`;
  }

  return {
    query: cleanQuery,
    results,
    instantAnswer,
    timestamp: new Date().toISOString(),
  };
}

async function searchAhmia(query: string, torSocksUrl: string): Promise<SearchResult[]> {
  const url = `https://ahmia.fi/search/?q=${encodeURIComponent(query)}`;
  const agent = new SocksProxyAgent(torSocksUrl);

  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": randomUserAgent(),
      "Accept": "text/html,application/xhtml+xml",
    },
    agent,
  }, TOR_SEARCH_TIMEOUT_MS);

  if (!res.ok) throw new Error(`Ahmia returned ${res.status}`);

  const html = await res.text();
  const results: SearchResult[] = [];

  const titleRe = /<h4[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const descRe = /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;

  const titles: Array<{ url: string; title: string }> = [];
  const descs: string[] = [];

  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null && titles.length < 10) {
    const rawUrl = m[1].trim();
    const rawTitle = m[2].replace(/<[^>]+>/g, "").trim();
    if (rawUrl && rawTitle && rawUrl.includes(".onion")) {
      titles.push({ url: rawUrl, title: rawTitle });
    }
  }

  while ((m = descRe.exec(html)) !== null && descs.length < 10) {
    descs.push(m[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < titles.length; i++) {
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      snippet: descs[i] ?? "",
      source: "ahmia.fi (.onion index)",
    });
  }

  return results;
}

async function searchTorSearXNG(query: string, torSocksUrl: string): Promise<SearchResult[]> {
  const onionInstances = [
    "http://searxspbitokayvkhzhsnljde7rqmn7rvoga7gg6wketjxsbe4sxlqd.onion",
    "http://searx3aolosaf3urwnhpynlhuokqsgz47si4pzz5hvb7uuzyjncl2tid.onion",
  ];

  const agent = new SocksProxyAgent(torSocksUrl);

  for (const instance of onionInstances) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&safesearch=0`;
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": randomUserAgent(),
          "Accept": "application/json",
        },
        agent,
      }, TOR_SEARCH_TIMEOUT_MS);

      if (!res.ok) continue;

      const data = await res.json() as {
        results?: Array<{ title?: string; url?: string; content?: string; engine?: string }>;
      };

      const results: SearchResult[] = (data.results ?? [])
        .filter((r) => r.url && r.title)
        .slice(0, 8)
        .map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
          source: `tor-searx (${r.engine ?? "unknown"})`,
        }));

      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }

  return [];
}

export async function searchDarkWeb(query: string, torSocksUrl: string): Promise<SearchBundle> {
  const cleanQuery = query.trim().slice(0, 200);

  const [ahmiaResults, torSearxResults] = await Promise.allSettled([
    searchAhmia(cleanQuery, torSocksUrl),
    searchTorSearXNG(cleanQuery, torSocksUrl),
  ]);

  const results = [
    ...(ahmiaResults.status === "fulfilled" ? ahmiaResults.value : []),
    ...(torSearxResults.status === "fulfilled" ? torSearxResults.value : []),
  ].slice(0, 12);

  return {
    query: cleanQuery,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function formatDarkWebContext(bundle: SearchBundle): string {
  if (bundle.results.length === 0) return "";

  const lines: string[] = [
    `=== TOR NETWORK / DARK WEB SEARCH RESULTS FOR: "${bundle.query}" ===`,
    `Retrieved via Tor: ${bundle.timestamp}`,
    "Sources: Ahmia.fi (.onion index) + Tor-native SearXNG",
    "",
    "DARK WEB RESULTS:",
  ];

  for (let i = 0; i < bundle.results.length; i++) {
    const r = bundle.results[i];
    lines.push(`[${i + 1}] ${r.title}`);
    lines.push(`    URL: ${r.url}`);
    if (r.snippet) lines.push(`    ${r.snippet.slice(0, 400)}`);
    if (r.source) lines.push(`    via: ${r.source}`);
    lines.push("");
  }

  lines.push(
    "=== DEEP WEB USAGE NOTES ===",
    "These results come from Tor-indexed .onion sites and anonymous networks.",
    "Treat them as raw intelligence — verify critical claims independently.",
    "You can access any .onion URL directly by routing curl through the Tor SOCKS proxy: curl --socks5-hostname 127.0.0.1:9050 <onion-url>",
    "=== END DARK WEB RESULTS ===",
  );

  return lines.join("\n");
}

export function formatSearchContext(bundle: SearchBundle): string {
  if (!bundle.instantAnswer && bundle.results.length === 0) return "";

  const lines: string[] = [
    `=== LIVE WEB SEARCH RESULTS FOR: "${bundle.query}" ===`,
    `Retrieved: ${bundle.timestamp}`,
    "",
  ];

  if (bundle.instantAnswer) {
    lines.push(`QUICK ANSWER: ${bundle.instantAnswer}`);
    lines.push("");
  }

  if (bundle.results.length > 0) {
    lines.push("TOP RESULTS:");
    for (let i = 0; i < bundle.results.length; i++) {
      const r = bundle.results[i];
      lines.push(`[${i + 1}] ${r.title}`);
      lines.push(`    Source: ${r.url}`);
      if (r.snippet) lines.push(`    ${r.snippet.slice(0, 400)}`);
      lines.push("");
    }
  }

  lines.push(
    "=== HOW TO USE THESE RESULTS ===",
    "You just pulled this fresh from the internet. Use it naturally — work it into your reply the way a knowledgeable person would.",
    "Don't recite a list. Don't say 'according to result [2]'. Just talk — weave the key facts, names, numbers, and context directly into what you say.",
    "If something is confirmed by multiple sources, say it confidently. If results conflict, acknowledge it briefly.",
    "Mention a source URL only if it genuinely adds value (e.g. the user can go read more). Otherwise keep it conversational.",
    "These results are your ground truth — prioritise them over anything from your training data when they conflict.",
    "=== END SEARCH RESULTS ===",
  );

  return lines.join("\n");
}

export function extractSearchQuery(messages: { role: string; content: string }[]): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return "";
  return lastUserMsg.content.trim().slice(0, 200);
}
