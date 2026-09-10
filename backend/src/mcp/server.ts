#!/usr/bin/env node
// Standalone MCP server exposing the financial research tools over stdio.
// Run with `npm run mcp-server`, or point any MCP client (Claude Desktop,
// the MCP inspector, etc.) at this file. The Express backend in src/index.ts
// uses the same underlying tool implementations directly (see src/agent.ts)
// so the calculation logic only lives in one place.
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolDefinitions } from "../tools/index.js";

const server = new McpServer({
  name: "finance-research-tools",
  version: "1.0.0",
});

for (const tool of toolDefinitions) {
  server.tool(tool.name, tool.description, tool.schema.shape, async (args: unknown) => {
    try {
      const result = await tool.handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
    }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
