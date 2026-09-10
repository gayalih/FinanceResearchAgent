// Thin client for SEC EDGAR's free, keyless public APIs.
// Docs: https://www.sec.gov/edgar/sec-api-documentation

const BASE_DATA = "https://data.sec.gov";
const BASE_WWW = "https://www.sec.gov";

function userAgent(): string {
  const contact = process.env.SEC_EDGAR_CONTACT?.trim();
  if (!contact) {
    throw new Error(
      "SEC_EDGAR_CONTACT is not set. SEC EDGAR requires a descriptive User-Agent " +
        "(name + contact email) for automated requests. Set it in backend/.env."
    );
  }
  return contact;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return (await res.json()) as T;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(),
    },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return await res.text();
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerMapCache: Map<string, TickerEntry> | null = null;
let tickerMapFetchedAt = 0;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function loadTickerMap(): Promise<Map<string, TickerEntry>> {
  const now = Date.now();
  if (tickerMapCache && now - tickerMapFetchedAt < TICKER_MAP_TTL_MS) {
    return tickerMapCache;
  }
  const raw = await getJson<Record<string, TickerEntry>>(`${BASE_WWW}/files/company_tickers.json`);
  const map = new Map<string, TickerEntry>();
  for (const entry of Object.values(raw)) {
    map.set(entry.ticker.toUpperCase(), entry);
  }
  tickerMapCache = map;
  tickerMapFetchedAt = now;
  return map;
}

export interface CompanyLookup {
  cik: string; // zero-padded to 10 digits
  ticker: string;
  title: string;
}

export async function lookupCompany(tickerOrName: string): Promise<CompanyLookup> {
  const map = await loadTickerMap();
  const direct = map.get(tickerOrName.toUpperCase());
  if (direct) {
    return { cik: String(direct.cik_str).padStart(10, "0"), ticker: direct.ticker, title: direct.title };
  }
  const needle = tickerOrName.toLowerCase();
  for (const entry of map.values()) {
    if (entry.title.toLowerCase().includes(needle)) {
      return { cik: String(entry.cik_str).padStart(10, "0"), ticker: entry.ticker, title: entry.title };
    }
  }
  throw new Error(`Could not find a SEC-registered company matching "${tickerOrName}"`);
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<
      string,
      {
        units: Record<
          string,
          Array<{
            end: string;
            start?: string;
            val: number;
            accn: string;
            fy: number;
            fp: string;
            form: string;
            filed: string;
          }>
        >;
      }
    >;
  };
}

export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  return getJson<CompanyFacts>(`${BASE_DATA}/api/xbrl/companyfacts/CIK${cik}.json`);
}

export interface SubmissionsRecent {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export async function getSubmissions(cik: string): Promise<SubmissionsRecent> {
  return getJson<SubmissionsRecent>(`${BASE_DATA}/submissions/CIK${cik}.json`);
}

export function filingDocumentUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const accnNoDashes = accessionNumber.replace(/-/g, "");
  const cikNoPad = String(Number(cik));
  return `${BASE_WWW}/Archives/edgar/data/${cikNoPad}/${accnNoDashes}/${primaryDocument}`;
}

export async function fetchFilingText(url: string): Promise<string> {
  const html = await getText(url);
  return stripHtml(html);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|li|br|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export interface FullTextSearchHit {
  form: string;
  filedAt: string;
  ciks: string[];
  displayNames: string[];
  accessionNumber: string;
  fileName: string;
}

export async function fullTextSearch(
  query: string,
  opts: { forms?: string; ciks?: string; limit?: number } = {}
): Promise<FullTextSearchHit[]> {
  const params = new URLSearchParams({ q: query });
  if (opts.forms) params.set("forms", opts.forms);
  if (opts.ciks) params.set("ciks", opts.ciks);
  const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
  const raw = await getJson<{
    hits: { hits: Array<{ _id: string; _source: Record<string, unknown> }> };
  }>(url);
  const hits = raw.hits?.hits ?? [];
  return hits.slice(0, opts.limit ?? 10).map((h) => {
    const src = h._source as Record<string, unknown>;
    const [accessionNumber, fileName] = h._id.split(":");
    return {
      form: String(src.file_type ?? src.form ?? ""),
      filedAt: String(src.file_date ?? ""),
      ciks: (src.ciks as string[]) ?? [],
      displayNames: (src.display_names as string[]) ?? [],
      accessionNumber,
      fileName,
    };
  });
}
