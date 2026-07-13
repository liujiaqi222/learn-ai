# MCP：写一个 Server（注册三原语）

`McpServer` 实例、数据库、transport 都已给好。你要注册三原语：一个 `query_user` 工具、一个 `docs://guide` 静态资源、一个 `summarize_user` 提示词。

## 你要做的

打开 `index.ts`，填三个 `TODO`：`registerTool` / `registerResource` / `registerPrompt`。

## 运行（无需 Client，直接喂 JSON-RPC）

```bash
bun install   # 首次
bun problem/index.ts <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_user","arguments":{"userId":"002"}}}
EOF
```

`tools/list` 能列出 `query_user`、`tools/call` 返回李四的信息，就对了。无需 `.env`。

## 对照

卡住看 `../solution/mcp-server.ts`，讲解见 `../explainer/readme.md`。
