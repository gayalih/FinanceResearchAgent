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
  currency: 'USD';
  years: YearlyFinancials[];
  source: string;
}

export interface StockPricePoint {
  date: string;
  close: number;
}

export interface GetStockDataResult {
  ticker: string;
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  totalReturnPct: number;
  minClose: number;
  maxClose: number;
  monthlySeries: StockPricePoint[];
  source: string;
}

export interface YearlyRatios {
  fiscalYear: number;
  revenueGrowthPct: number | null;
  netProfitMarginPct: number | null;
  roePct: number | null;
  debtToEquity: number | null;
  epsGrowthPct: number | null;
}

export interface CalculateRatiosResult {
  years: YearlyRatios[];
  summary: {
    periodStart: number;
    periodEnd: number;
    revenueCagrPct: number | null;
    netIncomeCagrPct: number | null;
    epsCagrPct: number | null;
    marginTrend: 'improving' | 'declining' | 'flat' | 'unknown';
    leverageTrend: 'improving' | 'declining' | 'flat' | 'unknown';
    roeTrend: 'improving' | 'declining' | 'flat' | 'unknown';
  };
}

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

export interface ToolTraceEntry {
  tool: string;
  input: unknown;
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentRunResult {
  answer: string;
  trace: ToolTraceEntry[];
  toolOutputsByName: Record<string, unknown[]>;
}
