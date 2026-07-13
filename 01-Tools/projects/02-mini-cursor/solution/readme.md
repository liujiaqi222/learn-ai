# mini-cursor：参考实现

能读 / 写 / 列目录 / 执行命令的 Agent，全自动造出一个 React TodoList。

## 运行

```bash
cp .env.example .env   # 填 MODEL_NAME / API_KEY / BASE_URL
bun install            # 首次
bun solution/mini-cursor.ts
```

> ⚠️ `exec_command` 能跑任意命令且无沙箱。运行前看清 `solution/mini-cursor.ts` 里的任务 prompt，确认要在当前目录建 `react-todo-app` 再跑。

讲解见 `../explainer/readme.md`。`solution/exec.ts` 是 spawn 的单独教学 demo；`../practice/` 是默写练习区。
