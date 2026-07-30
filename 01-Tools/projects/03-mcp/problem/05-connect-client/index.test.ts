import { expect, test } from "bun:test";
import { inspectServer } from "./index";

test("能通过 stdio 获取并调用远端 Tool", async () => {
  const result = await inspectServer();

  expect(result.toolNames).toContain("echo");
  expect(String(result.result)).toContain("echo:hello");
});
