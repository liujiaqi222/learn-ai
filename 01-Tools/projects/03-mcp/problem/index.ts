import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * 练习：写一个 MCP Server，注册三原语（Tool / Resource / Prompt）。
 * 数据库 / server 实例 / transport 都已给好，你只需填三个 TODO。
 * 参考：../solution/mcp-server.ts；讲解见 ../explainer/readme.md。
 *
 * 自测（无需 Client，直接喂 JSON-RPC）：
 *   bun problem/index.ts <<'EOF'
 *   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}
 *   {"jsonrpc":"2.0","method":"notifications/initialized"}
 *   {"jsonrpc":"2.0","id":2,"method":"tools/list"}
 *   {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_user","arguments":{"userId":"002"}}}
 *   EOF
 */

const database = {
  users: {
    "001": { id: "001", name: "张三", email: "zhangsan@example.com", role: "admin" },
    "002": { id: "002", name: "李四", email: "lisi@example.com", role: "user" },
    "003": { id: "003", name: "王五", email: "wangwu@example.com", role: "user" },
  } as Record<string, { id: string; name: string; email: string; role: string }>,
};

const server = new McpServer({ name: "user-info-server", version: "1.0.0" });

// TODO 1: 注册 Tool -- query_user
// 提示：server.registerTool("query_user",
//   { description: "查询用户信息", inputSchema: { userId: z.string() } },
//   async ({ userId }) => ({ content: [{ type: "text", text: "..." }] }))

// TODO 2: 注册 Resource -- docs://guide（静态资源）
// 提示：server.registerResource("guide", "docs://guide",
//   { description: "使用指南", mimeType: "text/plain" },
//   async () => ({ contents: [{ uri: "docs://guide", mimeType: "text/plain", text: "..." }] }))

// TODO 3: 注册 Prompt -- summarize_user
// 提示：server.registerPrompt("summarize_user",
//   { description: "生成总结某用户的提示", argsSchema: { userId: z.string() } },
//   async ({ userId }) => ({ messages: [{ role: "user", content: { type: "text", text: "..." } }] }))

// ⚠️ stdio server 不能 console.log（stdout 是协议通道），打日志用 console.error
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] 练习版 server 已就绪，等待 stdin 输入...");
