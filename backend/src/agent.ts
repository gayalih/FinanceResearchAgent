import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { toolDefinitions } from "./tools/index.js";

const MAX_TOOL_ITERATIONS = 8;

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

function anthropicTools(): Anthropic.Tool[] {
  return toolDefinitions.map((t) => {
    const jsonSchema = zodToJsonSchema(t.schema, { target: "openApi3" }) as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description,
      input_schema: jsonSchema as Anthropic.Tool.InputSchema,
    };
  });
}

const SYSTEM_PROMPT = `You are a Personal Finance Research Agent. You analyze public companies using
public financial datasets only (SEC EDGAR filings and public market price data) - never personal
financial data.

Rules:
- Always call get_financials first to retrieve raw figures for the requested company and period.
- Always pass the exact "years" array from get_financials into calculate_ratios to get growth rates,
  margins, ROE, debt-to-equity, and CAGR/trend figures. Never compute ratios, growth rates, or
  averages yourself by hand - the tool is the source of truth for every number in your answer.
- Call get_stock_data to add market-performance context (total return, price range) over the same period.
- Call search_filings at least once to ground qualitative claims (strategy shifts, risk factors,
  management's own explanation of results) in the actual filing text, and cite what you find.
- If a ticker can't be resolved or data is missing for some years, say so plainly rather than guessing.
- When you are done gathering data, write a final answer in markdown with these sections:
  ## Verdict (one paragraph, direct answer to the question)
  ## Revenue & Profitability
  ## Balance Sheet & Leverage
  ## Per-Share Performance
  ## Stock Performance
  ## Key Risks & Context (from filings)
  ## Data & Caveats
- Cite concrete numbers (with fiscal years) from the tool outputs. Keep it factual and concise.`;

export async function runFinancialResearchAgent(question: string): Promise<AgentRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to backend/.env before running the agent.");
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const tools = anthropicTools();
  const trace: ToolTraceEntry[] = [];
  const toolOutputsByName: Record<string, unknown[]> = {};

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
      return { answer, trace, toolOutputsByName };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const def = toolDefinitions.find((t) => t.name === block.name);
      const started = Date.now();
      if (!def) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
        trace.push({ tool: block.name, input: block.input, ok: false, error: "unknown tool", durationMs: 0 });
        continue;
      }
      try {
        const parsed = def.schema.parse(block.input);
        const output = await def.handler(parsed);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
        trace.push({ tool: block.name, input: block.input, ok: true, output, durationMs: Date.now() - started });
        (toolOutputsByName[block.name] ??= []).push(output);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${message}`,
          is_error: true,
        });
        trace.push({ tool: block.name, input: block.input, ok: false, error: message, durationMs: Date.now() - started });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Agent exceeded maximum tool-call iterations without producing a final answer.");
}
