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

const SEARX_INSTANCES = [
  "https://searx.be",
  "https://search.mdosch.de",
  "https://searx.tiekoetter.com",
  "https://searxng.site",
  "https://searx.fmac.xyz",
];

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
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

export function formatSearchContext(bundle: SearchBundle): string {
  if (!bundle.instantAnswer && bundle.results.length === 0) return "";

  const lines: string[] = [
    `=== LIVE INTERNET SEARCH — "${bundle.query}" (${bundle.timestamp}) ===`,
    "",
  ];

  if (bundle.instantAnswer) {
    lines.push(`INSTANT ANSWER: ${bundle.instantAnswer}`);
    lines.push("");
  }

  if (bundle.results.length > 0) {
    lines.push("SEARCH RESULTS:");
    for (let i = 0; i < bundle.results.length; i++) {
      const r = bundle.results[i];
      lines.push(`[${i + 1}] ${r.title}`);
      lines.push(`    URL: ${r.url}`);
      if (r.snippet) lines.push(`    ${r.snippet.slice(0, 300)}`);
      lines.push("");
    }
  }

  lines.push(
    "INSTRUCTIONS: You have just retrieved these real search results from the internet.",
    "Respond based on what was actually found above. Cite specific results, titles, and URLs when relevant.",
    "If results are present, use them as your primary source of truth for this response.",
    "=== END OF SEARCH RESULTS ==="
  );

  return lines.join("\n");
}

export function extractSearchQuery(messages: { role: string; content: string }[]): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return "";
  return lastUserMsg.content.trim().slice(0, 200);
}
