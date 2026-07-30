import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import path from "node:path";

export async function inspectServer() {
  const serverPath = path.join(import.meta.dir, "server-fixture.ts");

  // TODO：
  // 1. 创建 MultiServerMCPClient，用 stdio 启动 serverPath（command 是 bun）。
  // 2. 获取工具，调用 echo，参数为 { text: "hello" }。
  // 3. 返回 { toolNames, result }。
  // 4. 无论成功失败都关闭 client，避免测试留下子进程。

  return { toolNames: [] as string[], result: "" };
}
