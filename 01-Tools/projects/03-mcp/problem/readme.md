# MCP：独立测评

这里不是完整项目，而是把 MCP 的重要能力拆成互不依赖的小题。
每道题都提供 TODO 起手架和行为测试；先实现，再用测试判断是否掌握。

| 题目 | 测评能力 | 命令 |
|---|---|---|
| `01-register-tool` | 注册、发现并调用 Tool | `bun test problem/01-register-tool` |
| `02-static-resource` | 注册并读取静态 Resource | `bun test problem/02-static-resource` |
| `03-resource-template` | 注册并读取参数化 Resource | `bun test problem/03-resource-template` |
| `04-register-prompt` | 注册并获取 Prompt | `bun test problem/04-register-prompt` |
| `05-connect-client` | 用 stdio Client 获取并调用 MCP Tool | `bun test problem/05-connect-client` |

测试只检查对外行为，不限制你的具体代码写法。未完成 TODO 时测试失败是正常的。

推荐顺序：

1. 先完成题目并运行测试。
2. 卡住时看 `../explainer/readme.md` 的对应章节。
3. 最后才对照 `../explainer/examples/`，避免直接照抄。
