# mini-cursor：实现 exec_command（spawn 桥接）

本课最不直观的部分是把 `spawn` 的事件驱动模型桥接成可 `await` 的 Promise。这个练习单独练它。


## 你要做的

打开 `index.ts`，实现 `execCommand`：起子进程跑命令，消费 stdio 流，等子进程结束后返回完整输出。

## 运行

```bash
bun problem/index.ts
```

看到 `ls -la` 的目录输出就对了。无需 `.env`、无需模型。

## 对照

卡住就看 `../solution/tools.ts` 里的 `execTool`，讲解见 `../explainer/readme.md` 第 4 节。
