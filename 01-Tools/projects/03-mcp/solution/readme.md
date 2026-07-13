# MCP：参考实现

一个「用户信息」MCP Server（Tool + Resource + Prompt 三原语）+ LangChain Client 接入。

## 运行

```bash
bun install
bun solution/mcp-server.ts   # 单独跑 server（等 stdin，Ctrl+C 退出）
bun solution/mcp-client.ts   # 端到端：拉起 server + 跑 Agent + 三段演示
```

讲解见 `../explainer/readme.md`。
