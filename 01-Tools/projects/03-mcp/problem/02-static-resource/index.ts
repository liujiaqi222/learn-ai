import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createServer() {
  const server = new McpServer({ name: "resource-exercise", version: "1.0.0" });

  // TODO：注册名为 guide、URI 为 docs://guide 的静态 Resource。
  // 返回 text/plain 内容，文本中应包含「使用指南」和「query_user」。

  return server;
}
