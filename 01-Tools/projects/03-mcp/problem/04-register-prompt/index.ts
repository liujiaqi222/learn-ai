import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const users: Record<string, { name: string; role: string }> = {
  "001": { name: "张三", role: "admin" },
  "002": { name: "李四", role: "user" },
};

export function createServer() {
  const server = new McpServer({ name: "prompt-exercise", version: "1.0.0" });

  // TODO：注册 summarize_user Prompt，要求 userId 字符串参数。
  // 获取 userId=001 的 Prompt 时，返回一条 user message，
  // 文本中应包含「张三」「admin」和「总结」。

  return server;
}
