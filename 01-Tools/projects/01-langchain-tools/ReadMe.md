# LangChain 工具调用：让模型长出"手和眼"

本项目用最小代码演示 **工具调用（Tool / Function Calling）**：给大模型挂一个 `read_file` 工具，让它能读取并解释你电脑上的文件。

> 本文不逐行翻译代码——代码本身已经够清楚。重点放在**为什么这么写**、**LangChain 帮你封装了什么**、以及**工具调用在整个 AI 应用栈里的位置**。

---

## 1. 它解决什么问题

普通聊天模型只能用它**训练时（冻结的）**知识回答，读不到你的文件、数据库、实时数据。给它"挂工具"后，模型可以：

1. 自己判断"我需要读这个文件"
2. 调用工具拿到真实内容
3. 基于真实内容回答

一句话：**模型是大脑，工具是手脚和眼睛**。模型本身不变（它不会真的"执行"代码），它只是产出一个结构化的"调用请求"，由你的代码去执行，再把结果喂回去。

> **和 RAG 的区别**：RAG 是你预先把相关内容检索出来塞进 prompt（模型被动接收）；工具调用是模型**主动按需**去取（适合"不知道要读什么、得看了才知道下一步"的场景，比如读代码后决定再读它 import 的文件）。两者可叠加。

---

## 2. 核心心智模型：对话 = 一条不断追加的消息数组

理解了这一点，后面的循环就豁然开朗。

`messages` 不是"几次提问"，而是一条 **append-only（只追加）的日志**。整个对话的状态就是"这个数组里现在有什么"。工具调用并不神秘——它只是往这条日志里追加**两类特殊消息**：

| LangChain 类 | 对应 OpenAI role | 含义 |
|---|---|---|
| `SystemMessage` | `system` | 系统设定（角色/工作流程） |
| `HumanMessage` | `user` | 你的提问 |
| `AIMessage` | `assistant` | 模型回复；**可带 `tool_calls`**（"我想调这些工具"） |
| `ToolMessage` | `tool` | 某次工具调用的**结果**，必须用 `tool_call_id` 关联回那次请求 |

所以"工具调用循环"的本质就是：**反复往这条日志里追加消息，直到模型不再要求调用工具。**

### 本示例中 `messages` 数组的演变（关键）

```
① 初始
[ System, Human ]

② 第 1 次 invoke → 模型决定调 read_file
[ System, Human, AIMessage(tool_calls=[ read_file {filePath} ]) ]
                              ↑ "我要读这个文件"

③ 执行工具，把结果作为 ToolMessage 追加
[ System, Human, AIMessage(tool_calls=...), ToolMessage(文件内容) ]
                                              ↑ tool_call_id 关联到上一步那次调用

④ 第 2 次 invoke → 模型看到内容，给出解释，不再调工具
[ ..., AIMessage(tool_calls=[]) ]
                       ↑ 空 → 循环结束 → 打印 content
```

记住这张图，下面所有代码都是它的实现。

---

## 3. 工具调用循环 = 一次次的"思考-行动"回合（ReAct）

为什么不一次答完？因为模型必须先**行动**（读文件）拿到信息，才能**推理**（解释）。这种"推理 → 行动 → 观察结果 → 再推理"的循环有个名字：**ReAct**（Reasoning + Acting）。

```
你提问 → 模型推理"需要读文件" → 行动(调工具) → 观察结果 → 再推理 → (不再需要工具) → 给答案
```

对应代码：

```ts
let response = await modelWithTools.invoke(messages);  // 第 1 次推理
messages.push(response)                                 // 把模型的"我要调工具"记进日志

while (response.tool_calls && response.tool_calls.length) {  // 还想调工具？
    // ① 执行所有工具调用（可能多个，用 Promise.all 并发）
    // ② 把结果包成 ToolMessage 追加进 messages
    response = await modelWithTools.invoke(messages)          // ③ 带着结果再推理一次
}
```

> 实际开发中**这个循环不用自己写**——LangChain 的 `createReactAgent` / `AgentExecutor` 会封装好。这里手写一遍，正是为了让你看清 Agent 的底层机制：**Agent = 模型 + 工具 + 这个循环**。

---

## 4. LangChain 在这里帮你封装了什么（分层视角）

把这一层和**原生 OpenAI HTTP API** 对照看，就能看清抽象层：

| 你写的代码 | LangChain 做的事 | 底层落到 OpenAI API |
|---|---|---|
| `tool(func, {name, description, schema})` | 把 zod schema 转成 **JSON Schema**，连同 name/description 注册成一个工具对象 | 请求里的 `tools` 字段 |
| `model.bindTools(tools)` | 返回一个"已绑定工具"的 `Runnable`，后续 invoke 自动带上工具定义 | 每次请求都附带 `tools` 参数 |
| `modelWithTools.invoke(messages)` | 序列化消息 → 发 HTTP → 解析响应 | `POST /chat/completions` |
| `new ToolMessage({content, tool_call_id})` | 标记为 `tool` 角色，关联到某次调用 | 响应里的 `tool_calls` + 你回传的 `tool` message |

**关键理解**：模型不认识 TypeScript、也不认识 zod。`bindTools` 把你的 zod schema 翻译成 **JSON Schema** 发给模型；模型输出的参数也是 JSON，你的代码再把它喂回工具函数。zod 只是让你（和 TS）写起来有类型安全的糖衣。

---

## 5. 四个关键 API（来自 `@langchain/core@1.x` 类型定义）

- **`tool(func, fields)`** → 返回 `DynamicStructuredTool`（schema 是 zod object 时）或 `DynamicTool`（schema 是 zod string 时）。它把普通函数包装成"模型可理解、代码可执行"的工具。
- **`StructuredTool.invoke(input, config)`** → `Promise<string | ToolMessage>`。**入参先按 schema 校验**，再执行你的函数；可能返回字符串，也可能返回 `ToolMessage`（所以代码里要做类型收窄）。
- **`model.bindTools(tools, kwargs?)`** → 返回一个绑定了工具的 `Runnable`，**不改变原 model**。
- **`ChatOpenAI.invoke(input)`** → 返回 `AIMessage`，带两个相关字段：`tool_calls`（合法的调用）和 `invalid_tool_calls`（模型生成但**不合法**的调用——本项目没处理，是个坑）。

---

## 6. 代码精读：只讲"不那么显然"的部分

代码本身可读，这里只点出几个**为什么这么写**：

- **`tool_call_id` 是协议契约**：`ToolMessage` 必须用 `tool_call_id` 关联到某条 `AIMessage` 里的某次 tool_call。模型靠它知道"这是你刚才那次调用的结果"。`@langchain/core` 里 `ToolMessage` 的 `tool_call_id: string` 是必填项。
- **消息顺序不能乱**：`AIMessage(tool_calls)` **必须排在** 对应的 `ToolMessage` **前面**——这是 OpenAI 协议的硬性要求。代码里先 `messages.push(response)` 再 push ToolMessage，顺序是对的。
- **`Promise.all` 并发**：模型一轮可能同时要调多个工具（比如同时读 3 个文件），用 `Promise.all` 并行执行。
- **`toolCall.args as any`**：`toolCall.args` 类型是 `Record<string, any>`（来自模型输出的 JSON），需断言成工具入参才能传给 `tool.invoke`。
- **返回值收窄成字符串**：`tool.invoke` 可能返回 `string` 或 `ToolMessage`，代码用两层三元判断统一提取成字符串，方便直接塞进 `ToolMessage.content`。
- **`try/catch` 把错误变成文本**：某个工具报错（如文件不存在）时，不抛异常中断流程，而是把错误信息**当结果喂回模型**，让模型自己应对（比如改路径重试或告知用户）。这是健壮 Agent 的常见做法。

---

## 7. ⚠️ 一个隐藏的多轮 bug（也是最好的学习点）

代码在循环**外** push 了第 1 个 `response`，但循环**内**第 2 次 `invoke` 拿到的新 `response` **没有 push 进 `messages`**：

```ts
let response = await modelWithTools.invoke(messages);
messages.push(response)              // ✅ 第 1 个 AIMessage 进了日志

while (response.tool_calls?.length) {
    // 执行工具、push ToolMessage ...
    response = await modelWithTools.invoke(messages)   // ❌ 这个新 response 没被 push
}
```

**后果**：本示例只读一个文件（单轮工具调用），能正常跑。但若模型**连续两轮**调工具（读完 A，又想读 A 里 import 的 B），第二轮的 `ToolMessage` 会变成"孤儿"——它的 `tool_call_id` 指向的那个 `AIMessage` 根本不在日志里，OpenAI 会直接返回 400 错误。

**一行修复**：在循环内 invoke 之后补一句 `messages.push(response)`：

```ts
    response = await modelWithTools.invoke(messages)
    messages.push(response)   // 补上：把每轮 AIMessage 都记进日志
```

> 这个 bug 本身就是理解"消息顺序与协议契约"的活教材——它告诉你：**日志里少一条 AIMessage，整条调用链就断了。**

---

## 8. 容易踩的坑 & 局限

- **🔒 安全**：`read_file` 接受**任意路径**，`../../etc/passwd` 也能读。生产环境必须限制根目录、校验/规范化路径，别让模型（或诱导模型的人）越界。
- **`description` 是模型选工具的唯一依据**：写不清模型就不调或调错。本项目用中文描述"什么时候该用"，这是工具版的 prompt engineering。
- **没有最大迭代次数**：若模型陷入"一直想调工具"的循环会无限跑。生产代码应加 `maxIterations` 上限。
- **`invalid_tool_calls` 未处理**：模型可能生成不合法参数（schema 不匹配），代码只看 `tool_calls`，忽略了非法的那批。
- **无流式输出**：`invoke` 是一次性返回。体验更好的是 `stream`，可逐 token 输出、流式 tool_call。
- **工具结果可能超 token 上限**：读大文件时，整份内容塞进消息会爆上下文窗口，需截断/分块。

---

## 9. 站高一点：工具调用在 AI 应用栈里的位置

工具调用是 **Agent 的地基**。从本项目的"手写循环"往上，是一条清晰的演进路径：

```
手写工具循环（本项目）          ← 你现在在这：看清底层
        ↓ 封装
createReactAgent / AgentExecutor  ← 官方帮你写好了循环
        ↓ 需要状态/分支/多 Agent
LangGraph                         ← 把 Agent 编排成显式状态机
```

**三个容易混淆的概念**：

| 概念 | 是什么 | 和工具调用的关系 |
|---|---|---|
| **工具调用** | 模型产出"可执行动作"的机制 | 本主题本身 |
| **Structured Output** | 让模型**按 schema 输出**（只输出，不执行） | 工具调用≈"带副作用的结构化输出"；纯结构化输出用 `withStructuredOutput` |
| **MCP** | 工具的**标准化协议/插拔生态**（Model Context Protocol） | 正交可叠加：MCP 提供"标准化的工具来源"，工具调用是"模型怎么用工具" |

**什么时候用什么**：要模型输出固定结构的数据 → Structured Output；要模型执行动作/取外部数据 → 工具调用；要让工具能跨应用复用、即插即用 → MCP；要预先给模型补充知识 → RAG。

---

## 10. 下一步学习路径

按顺序往下走，每一步都能在本仓库开一个新子项目：

1. **Structured Output**（`withStructuredOutput`）——让模型按 zod schema 返回结构化数据
2. **Streaming**——`stream` / `streamEvents`，逐 token 输出 + 流式 tool_call
3. **`createReactAgent`**——用官方封装替代本项目的手写循环，对比代码量
4. **LangGraph**——多步骤、多 Agent、带状态/检查点的工作流编排
5. **MCP**——接入标准化的工具生态，让工具跨应用复用
6. **RAG**——另一条"给模型外部知识"的路线，和工具调用组合使用

---

## 运行

```bash
# 配好 .env（从 .env.example 复制，填 MODEL_NAME / API_KEY / BASE_URL）后
bun install      # 首次
bun run index.ts
```
