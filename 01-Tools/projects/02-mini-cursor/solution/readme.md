# mini cursor：整体实操

这一目录属于学习者。保留已有的 `exec.ts`、`tools.ts` 和 `mini-cursor.ts`，代码由你亲手完成；AI 脚手架不会生成、补全或覆盖它们。完整 AI 参考实现放在 explainer/examples。

学习材料：本节《实现 mini cursor：让模型写代码、运行，再根据结果修改》文章，以及 [LangChain Tools](https://docs.langchain.com/oss/javascript/langchain/tools) 和 [Node.js child_process](https://nodejs.org/api/child_process.html)。

建议完成的整体任务：让助手在一个临时工作目录中创建 `greeting.ts`，执行后输出 `hello mini cursor`，并依据执行结果继续修改或报告结果。

建议文件分工：

- `exec.ts`：单独实验 `spawn`、输出流与退出状态。
- `tools.ts`：提供读文件、写文件、列目录和执行命令工具。
- `mini-cursor.ts`：创建模型、绑定工具，用 `while` 推进多轮调用。

实现时注意工作目录、调用与结果的 ID 对应、命令执行顺序，以及失败信息如何回到模型。用会结束的命令验证功能；开发服务器需要单独考虑启动、检查和关闭的生命周期。

在本章根目录配置 `.env` 后运行：

```bash
bun solution/mini-cursor.ts
```

已有脚本中的任务由你控制。运行前检查任务内容和目标目录；上面的命令运行的是你当前写下的代码，不会替你切换成本文建议的小任务。独立能力测评用 `bun test problem/`。
