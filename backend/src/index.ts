import "dotenv/config";
import express from "express";
import cors from "cors";
import { runFinancialResearchAgent } from "./agent.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/analyze", async (req, res) => {
  const question = req.body?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'question' string." });
    return;
  }
  try {
    const result = await runFinancialResearchAgent(question.trim());
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Financial research agent backend listening on http://localhost:${port}`);
});
