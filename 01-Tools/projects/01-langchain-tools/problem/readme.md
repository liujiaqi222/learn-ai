# LangChain 工具调用：手写 ReAct 循环

模型、`read_file` 工具、初始消息都已给好。你要实现**工具调用循环**：模型决定调工具 -> 执行 -> 把结果包成 `ToolMessage` 回填 -> 再 invoke，直到模型不再调工具。

## 你要做的

打开 `index.ts`，找到 `// TODO: 实现工具调用循环`，按提示写出 while 循环。

## 运行

```bash
cp .env.example .env   # 填 MODEL_NAME / API_KEY / BASE_URL
bun install            # 首次
bun problem/index.ts
```

## 对照

写完（或卡住）后看 `../solution/index.ts` 对比。讲解见 `../explainer/readme.md`。
