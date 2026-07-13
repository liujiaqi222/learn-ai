import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import path from "node:path";

/**
 * MCP Client 示例：用 @langchain/mcp-adapters 把上一节的 Agent 循环接上 MCP Server。
 *
 * 和 02-mini-cursor 唯一的本质区别：工具不再是本进程里的函数，而是从 MCP Server 跨进程拿来的。
 * 拿到之后，bindTools / 调用 / ToolMessage 回传 这套循环和 02 完全一样--MCP 工具被适配成了
 * 普通的 DynamicStructuredTool，Agent 根本不知道它背后是另一个进程。
 */

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
});

// MCP Server 的配置，和 Cursor / Claude Desktop 里的 mcpServers 写法完全一样：
// 用 stdio 传输 = 客户端自己把 server 当子进程拉起（command + args），靠 stdin/stdout 通信。
// 这里用 import.meta.dir 拼绝对路径，换机器也不用改。
const serverPath = path.join(import.meta.dir, "mcp-server.ts");
const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "user-info-server": {
      command: "bun",
      args: ["run", serverPath],
    },
  },
});

// 从所有已连接的 MCP Server 拉取工具，拍平成一个数组。底层会自动 initialize + tools/list。
const tools: DynamicStructuredTool[] = await mcpClient.getTools();
console.log(`[mcp-client] 从 MCP Server 拿到 ${tools.length} 个工具：${tools.map((t) => t.name).join(", ")}`);

const modelWithTools = model.bindTools(tools);

// ─────── 和 02 一模一样的 Agent 循环（模型 + 工具 + 循环）───────
async function runAgent(query: string, systemText: string, maxIterations = 30) {
  const messages: BaseMessage[] = [new SystemMessage(systemText), new HumanMessage(query)];

  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n⏳ 正在等待 AI 思考...`);
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n✅ AI 已完成任务。\nAI 输出: ${response.text}`);
      return response.text;
    }

    console.log(`🔧 检测到 ${response.tool_calls.length} 个工具调用，正在执行...`);
    for (const toolCall of response.tool_calls) {
      console.log(`🛠️  ${toolCall.name}，参数: ${JSON.stringify(toolCall.args)}`);
      const found = tools.find((t) => t.name === toolCall.name);
      if (found) {
        // 工具背后是跨进程的 tools/call--但对 Agent 来说和本地函数没区别。
        const result = await found.invoke(toolCall.args as any);
        console.log(`📝 结果: ${result}`);
        messages.push(new ToolMessage({ content: result, tool_call_id: toolCall.id ?? "" }));
      }
    }
  }
  return messages[messages.length - 1].text;
}

// ─────────── 演示 1：模型自动调用 MCP 工具 ───────────
console.log("\n========== 演示 1：模型自动调用 query_user ==========");
await runAgent(
  "查一下用户 002 的信息",
  "你是一个能查询用户信息的助手。可用的用户 ID 有 001、002、003。"
);

// ─────────── 演示 2：把 MCP Resource 注入上下文 ───────────
// Resource 不是模型自动调用的，而是「应用」主动读取后塞进 system message。
// 这里读 docs://guide，把它当作背景知识喂给模型。
console.log("\n========== 演示 2：读取 MCP Resource 注入上下文 ==========");
const resourcesByServer = await mcpClient.listResources();
let resourceText = "";
for (const [serverName, resources] of Object.entries(resourcesByServer)) {
  for (const resource of resources) {
    const contents = await mcpClient.readResource(serverName, resource.uri);
    resourceText += contents.map((c: any) => c.text).join("\n");
  }
}
console.log(`[mcp-client] 读取到 resource：\n${resourceText}`);

await runAgent(
  "这个 MCP Server 的使用指南是什么？",
  `你是助手。以下是 MCP Server 的使用指南，请据此回答：\n\n${resourceText}`
);

// ─────────── 演示 3：读取 MCP Prompt ───────────
// Prompt 是 user-controlled 的预置模板，不会在 Agent 循环里自动触发。
// mcp-adapters 没有便捷方法，要拿原始 Client 调 prompts/get。
console.log("\n========== 演示 3：读取 MCP Prompt ==========");
const rawClient = await mcpClient.getClient("user-info-server");
if (!rawClient) throw new Error("未找到 user-info-server");
const promptResult = await rawClient.getPrompt({ name: "summarize_user", arguments: { userId: "002" } });
console.log("[mcp-client] 拿到 prompt 消息：", JSON.stringify(promptResult.messages, null, 2));

// ⚠️ 关键收尾：MCP Server 是作为子进程被拉起的，不主动关掉它，整个 Node 进程不会退出。
//    这是 stdio 传输的通病--子进程还活着，父进程就挂着。养成最后 close() 的习惯。
await mcpClient.close();
console.log("\n[mcp-client] 已关闭 MCP 连接，进程退出");
