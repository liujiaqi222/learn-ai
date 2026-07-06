# LangChain 工具调用示例

本项目演示如何用 LangChain 给大模型挂载工具（读取本地文件），让模型能读取并解释你电脑上的代码。

## 它在干什么

普通聊天模型只能根据它训练时学到的知识回答问题，**读不到你电脑上的文件**。这段代码通过 LangChain 给模型挂了一个 `read_file` 工具，让模型可以：

1. 自己决定"我需要读这个文件"
2. 调用工具拿到文件内容
3. 基于真实内容回答你

## 代码逐段说明

### 1. 创建模型

```ts
const model = new ChatOpenAI({ modelName, apiKey, configuration: { baseURL } })
```

用环境变量里的配置连接一个 OpenAI 兼容的接口（`BASE_URL` 说明可能用的是第三方/代理服务）。

### 2. 定义工具（关键）

```ts
const readFileTool = tool(async ({ filePath }) => {
    const content = await fs.readFile(filePath, 'utf8')
    return `文件内容：${content}`
}, { name, description, schema })
```

`tool()` 把一个普通函数包装成"模型能理解、能调用的工具"，三个要素：

- **`name`**：工具名，模型靠它来调用
- **`description`**：告诉模型"什么时候该用这个工具"——**这段文字直接决定模型会不会调用它**，写不好模型就不调用
- **`schema`**：用 zod 定义入参 `{ filePath: string }`，模型据此生成参数

### 3. 把工具绑到模型上

```ts
const modelWithTools = model.bindTools(tools)
```

绑定后，模型回复时就**可以附带 tool_calls**（工具调用请求）了。

### 4. 初始化对话

```ts
const messages: BaseMessage[] = [ SystemMessage(...), HumanMessage(...) ]
```

`messages` 是整个对话记录（数组），模拟一个完整聊天：

- `SystemMessage`：系统设定，告诉 AI 它的角色和工作流程
- `HumanMessage`：你的提问（"读取 xxx 文件并解释"）

> 这里类型标注成 `BaseMessage[]`，是因为数组后续还要放模型回复（`AIMessage`）和工具结果（`ToolMessage`），不能用字面量推断出的窄类型。

## 核心：工具调用循环

这是最复杂也最重要的部分。模型不会一次就给你答案，而是**多轮交互**：

```
你提问 → 模型说"我要调 read_file" → 执行工具拿内容 →
把内容喂回模型 → 模型基于内容给出解释
```

对应代码流程：

**第一次调用模型**

```ts
let response = await modelWithTools.invoke(messages)
```

模型看到你想读文件，返回的 `response` 里会带 `tool_calls`（"我要调用 read_file，参数是 {filePath: '...'}"）。

**把模型的回复加进对话记录**，保持上下文完整。

**`while` 循环：只要模型还想调用工具，就一直循环**

```ts
while (response.tool_calls && response.tool_calls.length)
```

循环内做三件事：

#### ① 执行所有工具调用

```ts
const toolResults = await Promise.all(response.tool_calls.map(async toolCall => {
    const tool = tools.find(t => t.name === toolCall.name)  // 按名字找工具
    ...
    const result = await tool.invoke(toolCall.args as any)   // 真正执行
    return typeof result === 'string' ? result : ...          // 提取字符串
}))
```

- 模型一次可能要调多个工具，用 `Promise.all` 并行执行
- `toolCall.args` 是模型生成的参数（如 `{filePath: '/...'}`），交给工具执行
- `try/catch` 防止某个工具报错（比如文件不存在）把整个流程搞崩

#### ② 把工具结果塞回对话

```ts
response.tool_calls.forEach((toolCall, index) => {
    messages.push(new ToolMessage({
        content: toolResults[index],      // 工具返回的内容
        tool_call_id: toolCall.id ?? ''   // 关联到哪次调用
    }))
})
```

用 `ToolMessage` 包装结果，`tool_call_id` 用来告诉模型"这是你刚才那次调用的结果"。

#### ③ 再次调用模型

```ts
response = await modelWithTools.invoke(messages)
```

带着完整对话（含工具结果）再问一次。这时模型看到了文件内容，可能：

- 直接给出最终解释 → `tool_calls` 为空 → **`while` 循环结束**
- 还想再读别的文件 → `tool_calls` 非空 → **继续循环**

循环结束后打印最终答案。

## 一句话总结

> 这段代码手动实现了一个**最小 Agent**：模型决定调工具 → 执行 → 结果回传 → 模型再思考，循环直到不再需要工具。

实际开发中这个循环通常不用自己写，LangChain 的 `AgentExecutor` 或 `createReactAgent` 会帮你封装。这里手写一遍是为了让你看清 Agent 的底层运作机制。

## 运行

```bash
# 配置好 .env（MODEL_NAME / API_KEY / BASE_URL）后
bun run index.ts
```
