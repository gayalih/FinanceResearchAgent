import { z } from "zod";
import { getCompanyFacts, lookupCompany, type CompanyFacts } from "../secEdgar.js";

export const getFinancialsInput = z.object({
  ticker: z.string().describe("Stock ticker symbol, e.g. AAPL, MSFT, TSLA"),
  years: z.number().int().min(1).max(10).default(5).describe("Number of most recent fiscal years to return"),
});

export type GetFinancialsInput = z.infer<typeof getFinancialsInput>;

export interface YearlyFinancials {
  fiscalYear: number;
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  totalAssets: number | null;
  epsDiluted: number | null;
}

export interface GetFinancialsResult {
  ticker: string;
  companyName: string;
  cik: string;
  currency: "USD";
  years: YearlyFinancials[];
  source: string;
}

const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
];
const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss"];
const EQUITY_TAGS = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"];
const LIABILITIES_TAGS = ["Liabilities"];
const ASSETS_TAGS = ["Assets"];
const EPS_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasic"];

type UsGaapFacts = NonNullable<CompanyFacts["facts"]["us-gaap"]>;

// SEC's per-datapoint "fy" field is the fiscal year of the FILING that
// reported the value, not necessarily the fiscal year the value describes -
// a 10-K's income statement also carries 1-2 prior years as comparatives, and
// those comparative datapoints keep the *current* filing's fy label. So we
// key each value by its actual period end date instead, and merge across
// tag name variants (companies switch XBRL tags over time, e.g. "Revenues"
// -> "RevenueFromContractWithCustomerExcludingAssessedTax" after ASC 606).
function mergeAnnualSeriesAcrossTags(
  usGaap: UsGaapFacts,
  tags: string[]
): Map<string, { val: number; filed: string }> {
  const out = new Map<string, { val: number; filed: string }>();
  for (const tag of tags) {
    const fact = usGaap[tag];
    if (!fact) continue;
    const points = fact.units.USD ?? fact.units["USD/shares"] ?? [];
    for (const p of points) {
      if (p.form !== "10-K") continue;
      if (p.fp && p.fp !== "FY") continue;
      if (p.start) {
        const durationDays = (Date.parse(p.end) - Date.parse(p.start)) / 86_400_000;
        if (durationDays < 300 || durationDays > 380) continue; // skip partial-year datapoints
      }
      const existing = out.get(p.end);
      if (!existing || p.filed > existing.filed) {
        out.set(p.end, { val: p.val, filed: p.filed });
      }
    }
  }
  return out;
}

export async function getFinancials(input: GetFinancialsInput): Promise<GetFinancialsResult> {
  const { cik, ticker, title } = await lookupCompany(input.ticker);
  const facts = await getCompanyFacts(cik);
  const usGaap = facts.facts["us-gaap"];
  if (!usGaap) {
    throw new Error(`No US-GAAP XBRL facts found for ${ticker} (CIK ${cik}). It may not file 10-Ks with the SEC.`);
  }

  const revenue = mergeAnnualSeriesAcrossTags(usGaap, REVENUE_TAGS);
  const netIncome = mergeAnnualSeriesAcrossTags(usGaap, NET_INCOME_TAGS);
  const equity = mergeAnnualSeriesAcrossTags(usGaap, EQUITY_TAGS);
  const liabilities = mergeAnnualSeriesAcrossTags(usGaap, LIABILITIES_TAGS);
  const assets = mergeAnnualSeriesAcrossTags(usGaap, ASSETS_TAGS);
  const eps = mergeAnnualSeriesAcrossTags(usGaap, EPS_TAGS);

  const periodEnds = new Set<string>([
    ...revenue.keys(),
    ...netIncome.keys(),
    ...equity.keys(),
    ...liabilities.keys(),
    ...assets.keys(),
    ...eps.keys(),
  ]);

  const sortedEnds = [...periodEnds].sort((a, b) => b.localeCompare(a)).slice(0, input.years).sort((a, b) => a.localeCompare(b));

  const years: YearlyFinancials[] = sortedEnds.map((end) => ({
    fiscalYear: Number(end.slice(0, 4)),
    periodEnd: end,
    revenue: revenue.get(end)?.val ?? null,
    netIncome: netIncome.get(end)?.val ?? null,
    totalEquity: equity.get(end)?.val ?? null,
    totalLiabilities: liabilities.get(end)?.val ?? null,
    totalAssets: assets.get(end)?.val ?? null,
    epsDiluted: eps.get(end)?.val ?? null,
  }));

  return {
    ticker,
    companyName: title,
    cik,
    currency: "USD",
    years,
    source: `SEC EDGAR XBRL company facts (https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json)`,
  };
}
