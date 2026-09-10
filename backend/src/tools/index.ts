import type { ZodObject, ZodRawShape } from "zod";
import { getFinancials, getFinancialsInput } from "./financials.js";
import { getStockData, getStockDataInput } from "./stockData.js";
import { calculateRatios, calculateRatiosInput } from "./ratios.js";
import { searchFilings, searchFilingsInput } from "./filings.js";

export interface ToolDefinition<TShape extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  schema: ZodObject<TShape>;
  handler: (input: any) => Promise<unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "get_financials",
    description:
      "Fetch a public company's annual income-statement and balance-sheet figures (revenue, net income, total equity, total liabilities, total assets, diluted EPS) for the most recent N fiscal years, sourced from SEC EDGAR XBRL filings. Always call this before calculate_ratios.",
    schema: getFinancialsInput,
    handler: getFinancials,
  },
  {
    name: "get_stock_data",
    description:
      "Fetch a public company's historical daily/monthly closing stock price over the last N years, plus total return over the period, sourced from free public market data (Stooq).",
    schema: getStockDataInput,
    handler: getStockData,
  },
  {
    name: "calculate_ratios",
    description:
      "Deterministically compute financial ratios and trends (revenue growth %, net profit margin %, ROE %, debt-to-equity, EPS growth %, and multi-year CAGRs/trends) from a list of yearly financial figures. This is a calculation tool, not an estimate - always use it instead of computing ratios by hand, and always feed it the exact output of get_financials.",
    schema: calculateRatiosInput,
    handler: async (input) => calculateRatios(input),
  },
  {
    name: "search_filings",
    description:
      "Search a company's recent SEC filings (e.g. 10-K, 10-Q) for text relevant to a query (e.g. risk factors, liquidity, management discussion) and return the most relevant passages with source links. Use this to ground qualitative claims in the actual filing text.",
    schema: searchFilingsInput,
    handler: searchFilings,
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((t) => t.name === name);
}
