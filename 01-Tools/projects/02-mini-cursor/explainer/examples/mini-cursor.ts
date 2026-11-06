/** AI 参考代码：从这个文件启动 mini cursor。 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import type { ToolCall } from "@langchain/core/messages";
import { createTools } from "./tools";
import { executeToolCalls } from "./dispatch-tools";
import { runAgent } from "./run-agent";

// 1. 读取并检查模型配置。Bun 会加载当前目录的 .env。
const modelName = process.env.MODEL_NAME;
const apiKey = process.env.API_KEY;
const baseURL = process.env.BASE_URL;

if (!modelName?.trim() || !apiKey?.trim() || !baseURL?.trim()) {
  throw new Error("请在练习根目录 .env 填写 MODEL_NAME、API_KEY 和 BASE_URL");
}

// 2. 创建本次任务的临时工作区，并准备四个工具。
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mini-cursor-agent-"));
const tools = createTools(workspace);

console.log("工作区：", workspace);

// 3. 创建模型客户端，再把工具定义绑定到每次模型请求。
const model = new ChatOpenAI({
  model: modelName,
  apiKey,
  configuration: { baseURL },
});

const modelWithTools = model.bindTools(tools);

// 4. 循环将调用这个函数；它执行模型提出的请求并打印真实结果。
async function execute(calls: ToolCall[]) {
  const results = await executeToolCalls(calls, tools);

  for (const result of results) {
    console.log(`工具结果 ${result.tool_call_id}：`, result.content);
  }

  return results;
}

// 5. 明确任务与运行约定，再启动循环。
const query =
  "创建 greeting.ts，运行后应输出 hello mini cursor。读取文件并执行验证，然后报告实际结果。";

const systemText = `你是代码助手，工作区是 ${workspace}。所有相对路径以它为基准。
只完成用户要求的小任务。命令运行 TypeScript 时使用 ${process.execPath}。
每条命令单独指定 workingDirectory；之前的 cd 不会改变后续命令的默认目录。
仅运行会结束的命令，根据 stdout、stderr 和 exitCode 判断结果。`;

const messages = await runAgent(query, modelWithTools, execute, systemText);

console.log("最终回复：", messages.at(-1)?.content);
