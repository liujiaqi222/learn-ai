import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { z } from "zod";

// 数据库
type User = { id: string; name: string; email: string; role: string };
const database: { users: Record<string, User> } = {
  users: {
    "001": {
      id: "001",
      name: "张三",
      email: "zhangsan@example.com",
      role: "admin",
    },
    "002": { id: "002", name: "李四", email: "lisi@example.com", role: "user" },
    "003": {
      id: "003",
      name: "王五",
      email: "wangwu@example.com",
      role: "user",
    },
  },
};

const server = new McpServer({
  name: "mcp-server",
  version: "1.0.0",
});

// 注册工具： 查询用户信息

server.registerTool(
  "query_user",
  {
    description:
      "查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。",
    inputSchema: {
      userId: z.string().describe("用户ID， 例如：001、002、003"),
    },
  },
  async ({ userId }) => {
    const user = database.users[userId];
    if (!user) {
      return {
        content: [
          {
            type: "text",
            text: `用户 ID ${userId} 不存在。可用的 ID: 001, 002, 003`,
          },
        ],
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
  },
);

// 注册资源
server.registerResource(
  "usage-guide",
  "https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro",
  {
    description: "What is the Model Context Protocol (MCP)?",
    mimeType: "text/plain",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: [
            "MCP 服务器使用指南",
            "====================",
            "本服务提供以下能力：",
            "1. 工具 query_user：输入用户 ID（001/002/003），返回该用户的姓名、邮箱、角色。",
            "",
            "参考资料：",
            "https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro",
          ].join("\n"),
        },
      ],
    };
  },
);
