import { z } from "zod";
import { fetchFilingText, filingDocumentUrl, getSubmissions, lookupCompany } from "../secEdgar.js";

export const searchFilingsInput = z.object({
  ticker: z.string().describe("Stock ticker symbol, e.g. AAPL, MSFT, TSLA"),
  query: z
    .string()
    .describe('What to look for inside the filing, e.g. "liquidity and capital resources" or "risk factors"'),
  formTypes: z
    .array(z.string())
    .default(["10-K"])
    .describe('SEC form types to search, e.g. ["10-K"], ["10-K","10-Q"]'),
  filingsToScan: z.number().int().min(1).max(5).default(2).describe("How many of the most recent matching filings to open and search inside"),
  maxSnippets: z.number().int().min(1).max(10).default(5).describe("Max relevant text snippets to return"),
});

export type SearchFilingsInput = z.infer<typeof searchFilingsInput>;

export interface FilingSnippet {
  form: string;
  filingDate: string;
  url: string;
  text: string;
  relevanceScore: number;
}

export interface SearchFilingsResult {
  ticker: string;
  companyName: string;
  query: string;
  filingsScanned: Array<{ form: string; filingDate: string; url: string }>;
  snippets: FilingSnippet[];
  note: string;
}

// Lightweight lexical retrieval ("RAG" without a vector store): tokenize the
// filing into paragraphs, score each paragraph by keyword overlap with the
// query, and return the top-scoring paragraphs as retrieved context. This is
// the retrieval step that sits between the raw tool output and the LLM's
// final synthesis - swap in an embeddings index here for semantic search.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "are",
  "was",
  "were",
  "have",
  "has",
  "our",
  "which",
  "these",
  "their",
  "will",
  "not",
  "such",
  "all",
]);

// Reward paragraphs that cover more *distinct* query terms far more than
// paragraphs that merely repeat one common term - a paragraph mentioning
// "liquidity", "capital" AND "resources" together is almost certainly the
// relevant section, whereas one just repeating "resources" several times
// (e.g. inside an unrelated competition discussion) is probably not.
function scoreParagraph(paragraphTokens: string[], queryTerms: Set<string>): number {
  const distinctHits = new Set<string>();
  let rawHits = 0;
  for (const t of paragraphTokens) {
    if (queryTerms.has(t)) {
      distinctHits.add(t);
      rawHits += 1;
    }
  }
  return distinctHits.size * 100 + rawHits;
}

// SEC filings break section headings ("Liquidity and Capital Resources") onto
// their own short line, separate from the paragraph beneath them. Splitting
// naively on blank lines strands the heading's keywords away from the very
// paragraph they describe, so short heading-like lines are folded into the
// next paragraph instead of being scored (or discarded) on their own.
function buildParagraphs(fullText: string): string[] {
  const lines = fullText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const paragraphs: string[] = [];
  let pendingHeading = "";
  for (const line of lines) {
    const looksLikeHeading = line.length < 100 && !/[.;:]$/.test(line);
    if (looksLikeHeading) {
      pendingHeading = pendingHeading ? `${pendingHeading} ${line}` : line;
      continue;
    }
    paragraphs.push(pendingHeading ? `${pendingHeading}: ${line}` : line);
    pendingHeading = "";
  }
  return paragraphs.filter((p) => p.length > 100 && p.length < 3200);
}

function extractTopSnippets(
  fullText: string,
  query: string,
  maxSnippets: number
): Array<{ text: string; score: number }> {
  const paragraphs = buildParagraphs(fullText);

  const queryTerms = new Set(tokenize(query).filter((w) => !STOPWORDS.has(w)));
  if (queryTerms.size === 0) return paragraphs.slice(0, maxSnippets).map((text) => ({ text, score: 0 }));

  const scored = paragraphs.map((p) => ({ text: p, score: scoreParagraph(tokenize(p), queryTerms) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.filter((s) => s.score > 0).slice(0, maxSnippets);
}

export async function searchFilings(input: SearchFilingsInput): Promise<SearchFilingsResult> {
  const { cik, ticker, title } = await lookupCompany(input.ticker);
  const submissions = await getSubmissions(cik);
  const { form, filingDate, accessionNumber, primaryDocument } = submissions.filings.recent;

  const matches: Array<{ form: string; filingDate: string; accessionNumber: string; primaryDocument: string }> = [];
  for (let i = 0; i < form.length && matches.length < input.filingsToScan; i++) {
    if (input.formTypes.includes(form[i])) {
      matches.push({
        form: form[i],
        filingDate: filingDate[i],
        accessionNumber: accessionNumber[i],
        primaryDocument: primaryDocument[i],
      });
    }
  }

  if (matches.length === 0) {
    return {
      ticker,
      companyName: title,
      query: input.query,
      filingsScanned: [],
      snippets: [],
      note: `No filings of type ${input.formTypes.join(", ")} found in recent SEC submissions for ${ticker}.`,
    };
  }

  const filingsScanned: SearchFilingsResult["filingsScanned"] = [];
  const snippets: FilingSnippet[] = [];

  for (const m of matches) {
    const url = filingDocumentUrl(cik, m.accessionNumber, m.primaryDocument);
    filingsScanned.push({ form: m.form, filingDate: m.filingDate, url });
    try {
      const text = await fetchFilingText(url);
      const top = extractTopSnippets(text, input.query, input.maxSnippets);
      for (const snippet of top) {
        snippets.push({
          form: m.form,
          filingDate: m.filingDate,
          url,
          text: snippet.text,
          relevanceScore: snippet.score,
        });
      }
    } catch {
      // If a document fails to fetch/parse, skip it rather than failing the whole tool call.
    }
  }

  const trimmed = snippets.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, input.maxSnippets);

  return {
    ticker,
    companyName: title,
    query: input.query,
    filingsScanned,
    snippets: trimmed,
    note:
      trimmed.length > 0
        ? "Snippets retrieved via lexical relevance ranking over the filing text (SEC EDGAR primary documents)."
        : "Filings were fetched but no paragraphs matched the query closely; consider a broader query.",
  };
}
