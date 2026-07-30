import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const users: Record<string, { id: string; name: string; role: string }> = {
  "001": { id: "001", name: "张三", role: "admin" },
  "002": { id: "002", name: "李四", role: "user" },
};

export function createServer() {
  const server = new McpServer({ name: "tool-exercise", version: "1.0.0" });

  // TODO：注册 query_user Tool。
  // 要求：
  // 1. userId 必须是字符串。
  // 2. 找到用户时，返回包含 id、name、role 的文本。
  // 3. 找不到时，返回包含「不存在」的文本，而不是让进程崩溃。

  return server;
}
