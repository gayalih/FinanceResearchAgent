# Personal Finance Research Agent

Ask things like _"Analyze whether Apple has improved financially over the last five years"_ and get
back an analysis grounded in SEC filings and public market data, not the model's guesses.

```
Angular UI  --POST /api/analyze-->  Express backend  --tool calls-->  Claude (tool-use loop)
                                          |
                                          +-- get_financials   (SEC EDGAR XBRL company facts)
                                          +-- get_stock_data   (Yahoo Finance chart API)
                                          +-- calculate_ratios (pure TS functions, not the LLM)
                                          +-- search_filings   (SEC EDGAR filing text + lexical RAG)
```

Only public datasets are used (SEC EDGAR + public market price data) — no personal financial data.
Every number in the final answer — revenue growth, net margin, ROE, debt/equity, EPS growth, CAGRs —
is computed by `calculate_ratios`, a deterministic TypeScript function, and handed to the model as a
tool result. The model narrates and interprets; it never does the arithmetic itself.

## Project layout

- `backend/` — Express + TypeScript API that runs the Claude tool-use agent loop.
  - `src/tools/` — the 4 tools (`get_financials`, `get_stock_data`, `calculate_ratios`, `search_filings`),
    each a plain async function with a Zod input schema.
  - `src/mcp/server.ts` — the _same_ tools exposed as a standalone MCP server over stdio, so you can
    also point Claude Desktop or any other MCP client at this project (`npm run mcp-server`).
  - `src/agent.ts` — the agent loop: sends the question + tool definitions to Claude, executes
    whichever tools it calls, feeds results back, repeats until Claude returns a final answer.
- `frontend/` — Angular app: a question box, example prompts, the rendered analysis, revenue/net
  income/stock charts, a ratio table, filing-derived citations, and a "tool trace" panel that shows
  exactly which tools ran, with what inputs/outputs — the point being to make the agent's tool use
  visible, not just its final prose.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

- `ANTHROPIC_API_KEY` — **required**. Get one at https://console.anthropic.com/settings/keys.
- `SEC_EDGAR_CONTACT` — required by SEC EDGAR's fair-access policy: every automated client must send a
  descriptive `User-Agent` (a name + contact email). Put your own info, e.g. `"Jane Doe jane@example.com"`.
- `ANTHROPIC_MODEL` / `PORT` — optional, have sensible defaults.

```bash
npm run dev
```

Runs on `http://localhost:4000`. `GET /api/health` reports whether the key is configured.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

Runs on `http://localhost:4200` and talks to the backend at `http://localhost:4000` (see
`frontend/src/environments/environment.ts` if you need to change that).

### 3. (Optional) Standalone MCP server

```bash
cd backend
npm run mcp-server
```

This runs the exact same 4 tools over the MCP stdio protocol, so you can wire this project into
Claude Desktop or the MCP inspector as a normal MCP tool server, independent of the Angular app.

## Data sources (all free, no API key required)

- **Financial statements** — [SEC EDGAR XBRL company facts API](https://www.sec.gov/edgar/sec-api-documentation)
  (`data.sec.gov/api/xbrl/companyfacts/...`). Only covers SEC-registered companies. Revenue/net
  income/equity/liabilities/EPS are read from whichever XBRL tag a company actually used that year
  (companies switch tags over time, e.g. after adopting ASC 606), matched and deduplicated by the
  fact's actual period-end date rather than SEC's `fy` label (which reflects the _filing's_ fiscal
  year, not necessarily the year the datapoint describes — a quirk worth knowing if you extend this).
- **Stock prices** — Yahoo Finance's public chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/...`),
  adjusted close, daily, downsampled to monthly for charting.
- **Filings / qualitative context** — SEC EDGAR submissions + the filing's own HTML document, with a
  lightweight lexical ("bag of words") retrieval step that ranks paragraphs by query-term overlap and
  returns the top matches as grounding context — a minimal stand-in for the "RAG" step in the
  architecture diagram. It merges short section headings (e.g. "Liquidity and Capital Resources")
  into the paragraph beneath them before scoring, since SEC filings put the heading on its own line.
  Swap in an embeddings index here for semantic search if you want to go further.

## Known limitations

- EDGAR only has data for US SEC registrants, non-US or private companies won't resolve.
- Fiscal-year labeling assumes the calendar year of the period-end date, which is the common
  convention but not universal (a January/February fiscal year-end company may label differently).
- The filing-search "RAG" is lexical, not semantic, it won't catch paraphrases with zero shared
  vocabulary with the query.
