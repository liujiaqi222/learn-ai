import { expect, test } from "bun:test";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { executeToolCalls } from "./index";

const echo = tool(async ({ text }) => text, {
  name: "echo", description: "回显文本", schema: z.object({ text: z.string() }),
});

test("每条结果保留原调用 id，包括对同一工具的多次调用", async () => {
  const results = await executeToolCalls([
    { id: "A", name: "echo", args: { text: "first" } },
    { id: "B", name: "echo", args: { text: "second" } },
  ], [echo]);
  expect(results.map((result) => result.tool_call_id)).toEqual(["A", "B"]);
  expect(results.map((result) => result.content)).toEqual(["first", "second"]);
});

test("串行执行有依赖的工具，先写再读", async () => {
  let saved = "";
  const write = tool(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    saved = "ready";
    return "written";
  }, { name: "write", description: "写入", schema: z.object({}) });
  const read = tool(async () => saved, { name: "read", description: "读取", schema: z.object({}) });
  const results = await executeToolCalls([
    { id: "W", name: "write", args: {} }, { id: "R", name: "read", args: {} },
  ], [write, read]);
  expect(results).toHaveLength(2);
  expect(results[1]?.content).toBe("ready");
});

test("未知工具和无效参数产生关联的错误反馈，后续调用仍可执行", async () => {
  const results = await executeToolCalls([
    { id: "unknown", name: "not_registered", args: {} },
    { id: "bad", name: "echo", args: { text: 123 } },
    { id: "ok", name: "echo", args: { text: "recovered" } },
  ], [echo]);
  expect(results.map((result) => result.tool_call_id)).toEqual(["unknown", "bad", "ok"]);
  expect(results[0]?.status).toBe("error");
  expect(String(results[0]?.content)).toContain("未注册");
  expect(results[1]?.status).toBe("error");
  expect(results[2]?.content).toBe("recovered");
});

test("缺少调用 id 时 reject，不伪造空字符串关联", async () => {
  await expect(executeToolCalls([{ name: "echo", args: { text: "x" } }], [echo])).rejects.toThrow();
});
