import { expect, test } from "bun:test";
import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { runAgent } from "./index";

function scriptedModel(replies: AIMessage[]) {
  const inputs: BaseMessage[][] = [];
  const model = {
    async invoke(messages: BaseMessage[]) {
      inputs.push([...messages]);
      const reply = replies[inputs.length - 1];
      if (!reply) throw new Error("脚本响应耗尽：循环没有正确停止");
      return reply;
    },
  };
  return { model, inputs };
}

test("多轮都先保存 AIMessage 再回填工具结果，最终回答也进入历史", async () => {
  const first = new AIMessage({ content: "", tool_calls: [{ id: "A", name: "write", args: {} }] });
  const second = new AIMessage({ content: "", tool_calls: [{ id: "B", name: "run", args: {} }] });
  const final = new AIMessage("已验证输出");
  const { model, inputs } = scriptedModel([first, second, final]);
  const executed: string[] = [];
  const messages = await runAgent("写文件并运行", model, async (calls) => {
    return calls.map((call) => {
      executed.push(call.name);
      return new ToolMessage({ content: "ok", tool_call_id: call.id! });
    });
  });
  expect(inputs).toHaveLength(3);
  expect(executed).toEqual(["write", "run"]);
  expect(inputs[0]?.map((message) => message.type)).toEqual(["system", "human"]);
  expect(inputs[0]?.[1]?.content).toBe("写文件并运行");
  expect(inputs[1]?.[2]).toBe(first);
  expect(inputs[2]?.[4]).toBe(second);
  expect(messages.map((message) => message.type)).toEqual(["system", "human", "ai", "tool", "ai", "tool", "ai"]);
  expect(messages.at(-1)).toBe(final);
});

test("没有工具调用时直接返回，工具执行器不会被调用", async () => {
  const { model, inputs } = scriptedModel([new AIMessage("直接回答")]);
  let executions = 0;
  const messages = await runAgent("你好", model, async () => { executions++; return []; });
  expect(inputs).toHaveLength(1);
  expect(executions).toBe(0);
  expect(messages.at(-1)?.content).toBe("直接回答");
});

test("无法解析的工具调用明确报错，不当作成功回答", async () => {
  const { model } = scriptedModel([new AIMessage({
    content: "", invalid_tool_calls: [{ name: "write", args: "{", error: "invalid JSON" }],
  })]);
  await expect(runAgent("写文件", model, async () => [])).rejects.toThrow();
});
