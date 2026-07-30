import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "client-fixture", version: "1.0.0" });

server.registerTool(
  "echo",
  {
    description: "原样返回输入文本",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({ content: [{ type: "text", text: `echo:${text}` }] })
);

await server.connect(new StdioServerTransport());
