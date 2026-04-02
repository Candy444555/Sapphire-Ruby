import { Router } from "express";
import { parsePhoneNumberFromString, parsePhoneNumber, getCountryCallingCode } from "libphonenumber-js";
import * as cheerio from "cheerio";

const router = Router();

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate",
  "Connection": "keep-alive",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function duckDuckGoSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const encoded = encodeURIComponent(query);
    const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encoded}&kl=us-en`);
    const $ = cheerio.load(html);
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    $(".result__body").each((_, el) => {
      const title = $(el).find(".result__title").text().trim();
      const url = $(el).find(".result__url").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      if (title && snippet) {
        results.push({ title, url: url || "", snippet });
      }
    });

    return results.slice(0, 8);
  } catch {
    return [];
  }
}

async function searchWhoCalledUs(phone: string): Promise<Array<{ rating: string; comment: string; date: string }>> {
  try {
    const clean = phone.replace(/\D/g, "");
    const formatted = clean.length === 11 && clean.startsWith("1")
      ? `${clean.slice(1, 4)}-${clean.slice(4, 7)}-${clean.slice(7)}`
      : `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;

    const html = await fetchHtml(`https://whocalledus.com/calls/${formatted}/`);
    const $ = cheerio.load(html);
    const comments: Array<{ rating: string; comment: string; date: string }> = [];

    $(".review-item, .comment-item, .user-comment").each((_, el) => {
      const rating = $(el).find(".rating, .stars, .score").text().trim();
      const comment = $(el).find(".comment-text, .review-text, p").first().text().trim();
      const date = $(el).find(".date, .time, time").text().trim();
      if (comment) comments.push({ rating: rating || "N/A", comment, date: date || "" });
    });

    return comments.slice(0, 5);
  } catch {
    return [];
  }
}

async function searchSpyDialer(phone: string): Promise<{ name?: string; type?: string; city?: string; state?: string } | null> {
  try {
    const clean = phone.replace(/\D/g, "").replace(/^1/, "");
    const html = await fetchHtml(`https://www.spydialer.com/default.aspx?p=${clean}`);
    const $ = cheerio.load(html);

    const name = $(".resultName, #fullName, .person-name").first().text().trim();
    const type = $(".lineType, .phone-type, #phoneType").first().text().trim();
    const city = $(".city, #city").first().text().trim();
    const state = $(".state, #state").first().text().trim();

    if (name || type || city) return { name: name || undefined, type: type || undefined, city: city || undefined, state: state || undefined };
    return null;
  } catch {
    return null;
  }
}

async function searchCallerIdTest(phone: string): Promise<{ carrier?: string; lineType?: string; timezone?: string } | null> {
  try {
    const clean = phone.replace(/\D/g, "");
    const res = await fetch(`https://www.calleridtest.com/api/lookup?number=${clean}`, {
      headers: { ...HEADERS, "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      carrier: data.carrier || data.provider || undefined,
      lineType: data.lineType || data.line_type || data.type || undefined,
      timezone: data.timezone || undefined,
    };
  } catch {
    return null;
  }
}

async function searchNumberway(phone: string): Promise<Array<{ title: string; snippet: string }>> {
  try {
    const clean = phone.replace(/\D/g, "").replace(/^1/, "");
    const area = clean.slice(0, 3);
    const prefix = clean.slice(3, 6);
    const line = clean.slice(6);
    const html = await fetchHtml(`https://www.numberway.com/phone/${area}-${prefix}-${line}`);
    const $ = cheerio.load(html);

    const info: Array<{ title: string; snippet: string }> = [];
    $(".result-item, .phone-result, .info-block").each((_, el) => {
      const title = $(el).find("h3, h4, .title").text().trim();
      const snippet = $(el).find("p, .description, .content").text().trim();
      if (snippet) info.push({ title: title || "Info", snippet });
    });

    const carrier = $(".carrier, #carrier, .phone-carrier").text().trim();
    if (carrier) info.unshift({ title: "Carrier", snippet: carrier });

    return info.slice(0, 5);
  } catch {
    return [];
  }
}

async function searchShouldIAnswer(phone: string): Promise<{ dangerLevel?: string; reports?: number; description?: string } | null> {
  try {
    const clean = phone.replace(/\D/g, "").replace(/^1/, "");
    const formatted = `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    const html = await fetchHtml(`https://www.shouldianswer.com/phone-number/${formatted}`);
    const $ = cheerio.load(html);

    const danger = $(".danger-level, .rating-level, .threat-level").first().text().trim();
    const reportsText = $(".reports-count, .number-of-reports").first().text().trim();
    const description = $(".number-description, .phone-description, .summary").first().text().trim();
    const reports = parseInt(reportsText) || undefined;

    if (danger || description) {
      return {
        dangerLevel: danger || undefined,
        reports,
        description: description || undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

router.post("/api/phone/lookup", async (req, res) => {
  const { phone } = req.body as { phone?: string };

  if (!phone || typeof phone !== "string") {
    return res.status(400).json({ error: "Phone number required" });
  }

  const clean = phone.trim().replace(/[\s\-\.\(\)]/g, "");
  const withPlus = clean.startsWith("+") ? clean : `+${clean.startsWith("1") ? clean : "1" + clean}`;

  const parsed = parsePhoneNumberFromString(withPlus);
  const isValid = parsed?.isValid() ?? false;

  const nationalNumber = parsed?.nationalNumber ?? clean.replace(/^\+?1/, "");
  const countryCode = parsed?.country ?? "US";
  const callingCode = parsed?.countryCallingCode ?? "1";
  const formatted = parsed?.formatInternational() ?? phone;
  const formattedNational = parsed?.formatNational() ?? phone;
  const numberType = parsed?.getType() ?? null;
  const uri = parsed?.getURI() ?? null;

  const displayPhone = formatted || phone;

  const [
    generalResults,
    ownerResults,
    reportResults,
    scamResults,
    whoCalled,
    spyDialer,
    shouldIAnswer,
  ] = await Promise.allSettled([
    duckDuckGoSearch(`"${displayPhone}" OR "${formattedNational}"`),
    duckDuckGoSearch(`"${formattedNational}" owner name person`),
    duckDuckGoSearch(`"${formattedNational}" complaint report spam scam`),
    duckDuckGoSearch(`who called me "${formattedNational}" OR "${displayPhone}"`),
    searchWhoCalledUs(nationalNumber),
    searchSpyDialer(nationalNumber),
    searchShouldIAnswer(nationalNumber),
  ]);

  const getValue = <T>(settled: PromiseSettledResult<T>, fallback: T): T =>
    settled.status === "fulfilled" ? settled.value : fallback;

  return res.json({
    phoneInfo: {
      original: phone,
      formatted: displayPhone,
      national: formattedNational,
      internationalFormat: formatted,
      countryCode,
      callingCode: `+${callingCode}`,
      nationalNumber,
      numberType: numberType ?? "UNKNOWN",
      uri,
      valid: isValid,
      areaCode: nationalNumber.slice(0, 3),
      prefix: nationalNumber.slice(3, 6),
      lineNumber: nationalNumber.slice(6),
    },
    searches: {
      general: getValue(generalResults, []),
      owner: getValue(ownerResults, []),
      reports: getValue(reportResults, []),
      scam: getValue(scamResults, []),
    },
    sources: {
      whoCalled: getValue(whoCalled, []),
      spyDialer: getValue(spyDialer, null),
      shouldIAnswer: getValue(shouldIAnswer, null),
    },
  });
});

export default router;
