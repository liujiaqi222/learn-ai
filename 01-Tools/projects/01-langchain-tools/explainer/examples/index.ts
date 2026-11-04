/** AI 参考代码：手写工具调用循环。请从练习根目录运行。 */
import fs from "node:fs/promises";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";

const modelName = process.env.MODEL_NAME;
const apiKey = process.env.API_KEY;
const baseURL = process.env.BASE_URL;
if (!modelName?.trim() || !apiKey?.trim() || !baseURL?.trim()) {
  throw new Error("请在练习根目录的 .env 填写 MODEL_NAME、API_KEY 和 BASE_URL");
}

const readFileTool = tool(
  async ({ filePath }) => {
    const content = await fs.readFile(filePath, "utf8");
    console.log("读取成功，字符数：", content.length);
    return content;
  },
  {
    name: "read_file",
    description: "读取 UTF-8 文本文件；需要查看文件实际内容时使用。",
    schema: z.object({
      filePath: z.string().describe("文件路径；相对路径以进程工作目录为基准"),
    }),
  },
);

const model = new ChatOpenAI({
  model: modelName,
  apiKey,
  configuration: { baseURL },
});
const modelWithTools = model.bindTools([readFileTool]);
const messages: BaseMessage[] = [
  new SystemMessage("你是代码助手。涉及文件实际内容时，先读取文件再回答。"),
  new HumanMessage("请读取 ./explainer/readme.md，概括它讲了什么。"),
];

console.log("请求模型");
let response = await modelWithTools.invoke(messages);
messages.push(response);

while (response.tool_calls?.length) {
  for (const call of response.tool_calls) {
    if (!call.id) throw new Error("工具调用缺少 id，无法关联结果");

    let content: string;
    try {
      if (call.name !== readFileTool.name) {
        throw new Error(`未注册的工具：${call.name}`);
      }
      console.log(`执行 ${call.name}，调用 ID：${call.id}`);
      const args = await readFileTool.schema.parseAsync(call.args);
      content = await readFileTool.invoke(args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      content = `工具执行失败：${reason}`;
    }

    messages.push(new ToolMessage({
      content,
      name: call.name,
      tool_call_id: call.id,
    }));
  }

  console.log("请求模型");
  response = await modelWithTools.invoke(messages);
  messages.push(response);
}

if (response.invalid_tool_calls?.length) {
  throw new Error("模型返回了无法解析的工具调用");
}
console.log("最终回复：", response.content);
