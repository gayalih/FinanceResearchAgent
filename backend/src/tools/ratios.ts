import { z } from "zod";
import type { YearlyFinancials } from "./financials.js";

const yearlyFinancialsSchema = z.object({
  fiscalYear: z.number(),
  periodEnd: z.string(),
  revenue: z.number().nullable(),
  netIncome: z.number().nullable(),
  totalEquity: z.number().nullable(),
  totalLiabilities: z.number().nullable(),
  totalAssets: z.number().nullable(),
  epsDiluted: z.number().nullable(),
});

export const calculateRatiosInput = z.object({
  years: z
    .array(yearlyFinancialsSchema)
    .min(2)
    .describe(
      "Yearly financial data as returned by get_financials, sorted or unsorted, oldest and newest fiscal years included"
    ),
});

export type CalculateRatiosInput = z.infer<typeof calculateRatiosInput>;

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
    marginTrend: "improving" | "declining" | "flat" | "unknown";
    leverageTrend: "improving" | "declining" | "flat" | "unknown";
    roeTrend: "improving" | "declining" | "flat" | "unknown";
  };
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

function cagr(from: number | null, to: number | null, periods: number): number | null {
  if (from === null || to === null || from <= 0 || to <= 0 || periods <= 0) return null;
  return (Math.pow(to / from, 1 / periods) - 1) * 100;
}

function trend(
  first: number | null,
  last: number | null,
  higherIsBetter: boolean
): "improving" | "declining" | "flat" | "unknown" {
  if (first === null || last === null) return "unknown";
  const diff = last - first;
  const threshold = Math.abs(first) * 0.02; // ignore noise under 2%
  if (Math.abs(diff) <= threshold) return "flat";
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  return improved ? "improving" : "declining";
}

export function calculateRatios(input: CalculateRatiosInput): CalculateRatiosResult {
  const sorted = [...input.years].sort((a, b) => a.fiscalYear - b.fiscalYear);

  const years: YearlyRatios[] = sorted.map((year, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const netProfitMarginPct =
      year.revenue !== null && year.revenue !== 0 && year.netIncome !== null
        ? (year.netIncome / year.revenue) * 100
        : null;
    const roePct =
      year.totalEquity !== null && year.totalEquity !== 0 && year.netIncome !== null
        ? (year.netIncome / year.totalEquity) * 100
        : null;
    const debtToEquity =
      year.totalLiabilities !== null && year.totalEquity !== null && year.totalEquity !== 0
        ? year.totalLiabilities / year.totalEquity
        : null;

    return {
      fiscalYear: year.fiscalYear,
      revenueGrowthPct: prev ? pctChange(prev.revenue, year.revenue) : null,
      netProfitMarginPct,
      roePct,
      debtToEquity,
      epsGrowthPct: prev ? pctChange(prev.epsDiluted, year.epsDiluted) : null,
    };
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const periods = sorted.length - 1;
  const firstMargin = years[0]?.netProfitMarginPct ?? null;
  const lastMargin = years[years.length - 1]?.netProfitMarginPct ?? null;
  const firstDebtEquity = years[0]?.debtToEquity ?? null;
  const lastDebtEquity = years[years.length - 1]?.debtToEquity ?? null;
  const firstRoe = years[0]?.roePct ?? null;
  const lastRoe = years[years.length - 1]?.roePct ?? null;

  return {
    years,
    summary: {
      periodStart: first.fiscalYear,
      periodEnd: last.fiscalYear,
      revenueCagrPct: cagr(first.revenue, last.revenue, periods),
      netIncomeCagrPct: cagr(first.netIncome, last.netIncome, periods),
      epsCagrPct: cagr(first.epsDiluted, last.epsDiluted, periods),
      marginTrend: trend(firstMargin, lastMargin, true),
      leverageTrend: trend(firstDebtEquity, lastDebtEquity, false),
      roeTrend: trend(firstRoe, lastRoe, true),
    },
  };
}

export function toRatiosInputFromFinancials(years: YearlyFinancials[]): CalculateRatiosInput {
  return { years };
}
