import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

const users: Record<string, { name: string; email: string }> = {
  "001": { name: "张三", email: "zhangsan@example.com" },
  "002": { name: "李四", email: "lisi@example.com" },
};

export function createServer() {
  const server = new McpServer({ name: "template-exercise", version: "1.0.0" });

  // TODO：用 ResourceTemplate 注册 user://{userId}。
  // 读取 user://002 时应返回李四和他的邮箱；未知 ID 应返回包含「不存在」的文本。

  return server;
}
