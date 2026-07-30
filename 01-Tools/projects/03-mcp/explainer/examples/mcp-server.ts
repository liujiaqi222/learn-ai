import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * AI 生成的完整参考代码，不是学习者的 solution。
 *
 * MCP Server 示例：一个「用户信息」服务。
 *
 * 它对外暴露三类原语（MCP 的三块积木）：
 *   - Tool   query_user      模型主动调用，查某个用户（action）
 *   - Resource  docs://guide 应用主动读取的使用指南（静态上下文）
 *   - Resource  user://{userId}  资源模板，按 userId 参数化读取（动态上下文）
 *   - Prompt summarize_user  预置的提示词模板（user-controlled）
 *
 * 传输方式用 stdio：客户端把它当子进程拉起，靠 stdin/stdout 收发 JSON-RPC 消息。
 */

// 一个内存里的假数据库——不依赖任何外部 API，所以这个 server 在哪都能跑、结果确定。
const database = {
  users: {
    "001": { id: "001", name: "张三", email: "zhangsan@example.com", role: "admin" },
    "002": { id: "002", name: "李四", email: "lisi@example.com", role: "user" },
    "003": { id: "003", name: "王五", email: "wangwu@example.com", role: "user" },
  } as Record<string, { id: string; name: string; email: string; role: string }>,
};

const server = new McpServer({
  name: "user-info-server",
  version: "1.0.0",
});

// ─────────────────────────── Tool ───────────────────────────
// query_user：模型根据对话上下文「自己决定」要不要调、传什么参数。
// inputSchema 是 zod 的「原始字段对象」{ userId: z.string() }，不是 z.object({...})——
// SDK 会自动把它包成 JSON Schema 发给客户端。
server.registerTool(
  "query_user",
  {
    description: "查询数据库中的用户信息。输入用户 ID，返回该用户的姓名、邮箱、角色。",
    inputSchema: {
      userId: z.string().describe("用户 ID，例如 001、002、003"),
    },
  },
  async ({ userId }) => {
    const user = database.users[userId];
    if (!user) {
      // 工具「失败」不抛异常，而是把可读的提示当文本返回——模型看到后会自己换 ID 重试。
      return {
        content: [{ type: "text", text: `用户 ID ${userId} 不存在，可用 ID：001、002、003` }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`,
        },
      ],
    };
  }
);

// ──────────────────────── Resource（静态） ────────────────────────
// docs://guide：一份静态文档。Resource 由「应用」决定何时读取、如何塞进上下文，
// 模型不会自动调用它（这点和 Tool 相反）。常用来在对话前注入说明书、schema 等。
server.registerResource(
  "guide",
  "docs://guide",
  {
    description: "MCP Server 使用指南",
    mimeType: "text/plain",
  },
  async () => {
    return {
      contents: [
        {
          uri: "docs://guide",
          mimeType: "text/plain",
          text: `MCP Server 使用指南
功能：提供用户查询工具（query_user）、用户资源（user://{userId}）和摘要提示词（summarize_user）。
用法：在 MCP 客户端（Cursor / Claude Desktop / LangChain）里自然语言提问，客户端会自动调用相应工具。`,
        },
      ],
    };
  }
);

// ──────────────────────── Resource（模板） ────────────────────────
// user://{userId}：参数化资源。和上面 query_user 返回的是同一份数据，但语义不同——
// 这里是「按 URI 读取上下文」（resources/read），不是「执行动作」（tools/call）。
// ResourceTemplate 的第二个参数是个变量回调，列出模板里能被替换的占位符。
server.registerResource(
  "user",
  new ResourceTemplate("user://{userId}", { list: undefined }),
  {
    description: "按 ID 读取单个用户信息（资源模板）",
    mimeType: "text/plain",
  },
  async (uri, { userId }) => {
    const user = database.users[String(userId)];
    if (!user) {
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text: `用户 ${userId} 不存在` }],
      };
    }
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `${user.id} / ${user.name} / ${user.email} / ${user.role}`,
        },
      ],
    };
  }
);

// ─────────────────────────── Prompt ───────────────────────────
// summarize_user：预置的提示词模板。Prompt 是 user-controlled——由用户在 UI 里显式选用
// （比如斜杠命令 /summarize_user），而不是模型自动触发。返回结构化的 messages。
server.registerPrompt(
  "summarize_user",
  {
    description: "生成一条「请总结某用户」的提示消息",
    argsSchema: {
      userId: z.string().describe("要总结的用户 ID"),
    },
  },
  async ({ userId }) => {
    const user = database.users[String(userId)];
    const text = user
      ? `请用一句话总结这个用户：${user.name}（${user.role}，邮箱 ${user.email}）。`
      : `用户 ${userId} 不存在，请提示可用的 ID。`;
    return {
      messages: [{ role: "user", content: { type: "text", text } }],
    };
  }
);

// ──────────────────────── 启动（stdio 传输） ────────────────────────
// ⚠️ stdio server 里绝对不要用 console.log：stdout 是 JSON-RPC 的消息通道，
//    任何非协议输出都会污染消息流、让客户端解析失败。要打日志只能 console.error（走 stderr）。
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] user-info-server 已在 stdio 上就绪");
