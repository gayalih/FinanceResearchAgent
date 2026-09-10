import { z } from "zod";

export const getStockDataInput = z.object({
  ticker: z.string().describe("Stock ticker symbol, e.g. AAPL, MSFT, TSLA"),
  years: z.number().int().min(1).max(10).default(5).describe("Number of years of price history to return"),
});

export type GetStockDataInput = z.infer<typeof getStockDataInput>;

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

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ close: (number | null)[] }>;
        adjclose?: Array<{ adjclose: (number | null)[] }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

function toDateString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function downsampleMonthly(points: StockPricePoint[]): StockPricePoint[] {
  const byMonth = new Map<string, StockPricePoint>();
  for (const p of points) {
    byMonth.set(p.date.slice(0, 7), p);
  }
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getStockData(input: GetStockDataInput): Promise<GetStockDataResult> {
  const symbol = input.ticker.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=10y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (finance-research-agent)" } });
  if (!res.ok) {
    throw new Error(`Yahoo Finance chart request failed (${res.status} ${res.statusText}) for ${symbol}`);
  }
  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) {
    const reason = data.chart.error?.description ?? "no data returned";
    throw new Error(`No price history found for ticker "${input.ticker}": ${reason}`);
  }

  const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close;
  const allPoints: StockPricePoint[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined) continue;
    allPoints.push({ date: toDateString(result.timestamp[i]), close });
  }
  if (allPoints.length === 0) {
    throw new Error(`No usable price points found for ticker "${input.ticker}"`);
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - input.years);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const windowed = allPoints.filter((p) => p.date >= cutoffStr);
  const points = windowed.length > 0 ? windowed : allPoints;

  const monthlySeries = downsampleMonthly(points);
  const startPrice = points[0].close;
  const endPrice = points[points.length - 1].close;
  const closeValues = points.map((p) => p.close);

  return {
    ticker: symbol,
    startDate: points[0].date,
    endDate: points[points.length - 1].date,
    startPrice,
    endPrice,
    totalReturnPct: ((endPrice - startPrice) / startPrice) * 100,
    minClose: Math.min(...closeValues),
    maxClose: Math.max(...closeValues),
    monthlySeries,
    source: `Yahoo Finance chart API, adjusted close (${url})`,
  };
}
