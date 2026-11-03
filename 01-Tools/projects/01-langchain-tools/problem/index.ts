import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import fs from "node:fs/promises";
import { z } from "zod";

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
});

const readFileTool = tool(
  async ({ filePath }: { filePath: string }) => {
    const content = await fs.readFile(filePath, "utf8");
    return `文件内容：${content}`;
  },
  {
    name: "read_file",
    description: "读取文件内容。输入文件路径（相对或绝对）。",
    schema: z.object({ filePath: z.string().describe("文件路径") }),
  },
);

const tools = [readFileTool];
const modelWithTools = model.bindTools(tools);

const messages: BaseMessage[] = [
  new SystemMessage(
    "你是一个代码助手，可以用 read_file 工具读取文件并解释代码。",
  ),
  new HumanMessage(
    "请读取 ./problem/index.ts 文件内容并解释代码",
  ),
];

let response = await modelWithTools.invoke(messages);
messages.push(response);


// TODO: 实现工具调用循环
// 提示：
//   1. while (response.tool_calls && response.tool_calls.length)
//   2. 用 Promise.all 并发执行所有 tool_calls：tools.find(t => t.name === toolCall.name)，再 tool.invoke(toolCall.args)
//   3. 把每个结果包成 new ToolMessage({ content, tool_call_id: toolCall.id ?? '' }) push 进 messages
//   4. response = await modelWithTools.invoke(messages); messages.push(response)
//   5. 循环结束后 console.log('最终结果：', response.content)


// 检测到模型返回了工具调用，进入循环：并发执行所有工具调用
while (response.tool_calls?.length) {
  console.log(`[检测到${response.tool_calls.length}个工具调用]`);
  const toolCallResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      try {
        const tool = tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          throw new Error(`未找到工具: ${toolCall.name}`);
        }
        console.log(
          `执行工具: ${toolCall.name} (${JSON.stringify(toolCall.args)})`,
        );
        const result = await tool.invoke(toolCall.args as any);
        const content =
          typeof result === "string" ? result : JSON.stringify(result);
        console.log(`工具调用 ${toolCall.name} 返回结果: ${content}`);
        return new ToolMessage({
          content,
          tool_call_id: toolCall.id ?? "",
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`工具调用 ${toolCall.name} 失败: ${errorMessage}`);
        return new ToolMessage({
          content: `错误：执行工具 ${toolCall.name} 失败: ${errorMessage}`,
          tool_call_id: toolCall.id ?? "",
        });
      }
    }),
  );
  // 将工具调用结果添加到消息数组中
  messages.push(...toolCallResults);

  // 再次调用模型，获取最终结果
  response = await modelWithTools.invoke(messages);
  messages.push(response);
}

console.log("最终结果：", response.content);
