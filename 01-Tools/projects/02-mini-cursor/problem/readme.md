# mini cursor：独立能力练习

先阅读 explainer，再合上参考代码完成下面四题。每题有独立输入和测试，不依赖其他题的作答。

| 题目 | 你要证明的能力 | 单独运行 |
|---|---|---|
| [01-file-tools](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/02-mini-cursor/problem/01-file-tools) | 用工具写文件、读回内容、查看目录 | `bun test problem/01-file-tools` |
| [02-exec-command](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/02-mini-cursor/problem/02-exec-command) | 等待命令结束，完整返回输出和退出状态 | `bun test problem/02-exec-command` |
| [03-dispatch-tools](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/02-mini-cursor/problem/03-dispatch-tools) | 串行执行调用、关联结果并反馈错误 | `bun test problem/03-dispatch-tools` |
| [04-agent-loop](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/02-mini-cursor/problem/04-agent-loop) | 维护多轮消息历史，正确继续和停止 | `bun test problem/04-agent-loop` |

在本章根目录运行全部练习测试：

```bash
bun test problem/
```

所有测试都使用临时目录、本地短命令或脚本化模型，不需要 API key，也不访问网络。起手架返回占位值，因此未作答时测试失败是预期状态；测试文件本身应能正常加载。

`problem/index.ts` 保留为已有的单文件练习，不属于新分题测试入口。`solution/` 中已有的代码保留；新题只在各题的 `index.ts` 作答。

最后对照 [AI 参考代码](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/02-mini-cursor/explainer/examples)，解释差异，不要求逐字复现同一种实现。
