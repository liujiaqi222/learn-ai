# LangChain 工具调用：从“请读取文件”到模型给出解释

你向模型发送一句话：“请读取 `./explainer/readme.md`，概括它讲了什么。”模型怎样拿到本地文件？它返回的第一条消息为什么可能没有答案？程序读完文件后，又该把结果交给谁？

本篇用一个 `read_file` 工具走完这个过程。读完后，你应当能解释工具定义、调用请求和执行结果的区别，并独立写出一个支持多轮调用的核心循环。只需具备基本的 TypeScript 和 `async/await` 知识。

## 阅读导航

- [1. 模型怎样获得读取文件的能力](#1-模型怎样获得读取文件的能力)
- [2. 一个工具包含两部分](#2-一个工具包含两部分)
- [3. 绑定工具后第一次调用模型](#3-绑定工具后第一次调用模型)
- [4. 从调用请求到执行结果](#4-从调用请求到执行结果)
- [5. 把一次调用扩展成循环](#5-把一次调用扩展成循环)
- [6. 多轮与并行调用如何保持对应关系](#6-多轮与并行调用如何保持对应关系)
- [7. 这个循环在 Agent 中处于什么位置](#7-这个循环在-agent-中处于什么位置)
- [8. 运行与观察](#8-运行与观察)
- [9. 复习与自测](#9-复习与自测)
- [参考资料](#参考资料)

## 1. 模型怎样获得读取文件的能力

远程模型能依据训练所得的知识和这次请求提供的上下文回答问题。仅仅把一个本地路径写进提问，并没有把对应文件的内容传给它。

**工具调用（Tool Calling，也称 Function Calling）**提供了一种协作方式：模型生成结构化的调用请求，应用程序执行请求，再把结果放进模型下一次能看到的上下文。[LangChain 对工具调用的说明](https://docs.langchain.com/oss/javascript/langchain/models#tool-calling)

这里有三个不同的角色：

| 角色 | 本节中负责什么 |
|---|---|
| 模型 | 判断是否需要读取文件，选择工具并生成参数，拿到结果后组织回答 |
| 应用程序 | 提供工具定义、保存消息、校验并执行调用、回填结果、控制循环 |
| 文件系统 | 保存真实文件，响应应用程序发起的读取操作 |

一次成功运行的协作过程如下：

```text
用户：“请读取这个文件并解释”
                ↓
应用把提问与工具定义发送给模型
                ↓
模型返回：read_file({ filePath: "./explainer/readme.md" })
                ↓
应用执行本地函数，文件系统返回内容
                ↓
应用把调用请求和执行结果一起发回模型
                ↓
模型基于文件内容生成回答
```

因此，“模型能够读文件”是整个系统表现出的能力。实际执行 `fs.readFile` 的是运行在你电脑上的应用程序。这个边界也解释了为什么工具权限应当由程序控制。

## 2. 一个工具包含两部分

普通函数已经能读文件。要让模型参与选择和调用，还需要提供一份工具定义：告诉模型工具叫什么、何时使用、接受什么参数。

```ts
import fs from "node:fs/promises";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const readFileTool = tool(
  async ({ filePath }) => {
    return await fs.readFile(filePath, "utf8");
  },
  {
    name: "read_file",
    description: "读取 UTF-8 文本文件；需要查看文件实际内容时使用。",
    schema: z.object({
      filePath: z.string().describe("文件路径；相对路径以进程工作目录为基准"),
    }),
  },
);
```

这段代码把两部分组织在同一个工具对象中：

| 部分 | 包含什么 | 谁使用 |
|---|---|---|
| 工具定义 | `name`、`description`、输入 schema | LangChain 转为提供商接受的格式，发送给模型 |
| 函数实现 | `fs.readFile` 等执行逻辑 | 应用程序在本地执行 |

模型收到的是工具定义。函数体保留在应用程序中，不会因为绑定工具而被上传执行。模型选择工具时会结合名称、描述、参数定义、提问和对话历史；清楚的描述有帮助，但描述本身不能保证模型一定正确调用。[官方工具文档](https://docs.langchain.com/oss/javascript/langchain/tools)

**参数模式（Schema）**描述输入的结构。这里的参数应是 `{ filePath: string }`，而不是一个裸字符串。

Zod 在这里同时承担运行时校验和类型推导：`z.string()` 使执行前的参数校验能够拒绝数字路径；TypeScript 则能推导函数里的 `filePath` 是字符串。请求发送时，LangChain 会把支持的 schema 转成模型提供商接受的定义。

需要区分结构正确与操作允许：一个字符串可以通过 `z.string()` 校验，但仍然可能是不存在的文件、超出允许范围的路径或二进制文件。路径权限和内容限制需要额外的执行规则。

## 3. 绑定工具后第一次调用模型

先创建模型客户端，再通过 `bindTools` 绑定工具定义：

```ts
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME!,
  apiKey: process.env.API_KEY!,
  configuration: { baseURL: process.env.BASE_URL! },
});
const modelWithTools = model.bindTools([readFileTool]);

const messages: BaseMessage[] = [
  new SystemMessage("你是代码助手。涉及文件实际内容时，先读取文件再回答。"),
  new HumanMessage("请读取 ./explainer/readme.md，概括它讲了什么。"),
];

const response = await modelWithTools.invoke(messages);
```

`ChatOpenAI` 用于与 OpenAI 或兼容其接口的服务通信；实际调用哪个服务由配置决定。模型和服务还需要支持工具调用，接口兼容不代表所有模型都具备相同能力。

`bindTools` 返回一个携带工具配置的可调用对象。它让之后的请求带上工具定义，不会替你读取文件，也不会启动工具执行循环。`invoke` 则发送一次模型请求，并返回一条模型消息。

在这次任务里，第一次响应可能包含下面这些字段。**以下是示意数据，调用 ID 和模型措辞由实际服务生成：**

```ts
// AIMessage 中与本节相关的字段
{
  content: "",
  tool_calls: [{
    name: "read_file",
    args: { filePath: "./explainer/readme.md" },
    id: "call_read_1",
    type: "tool_call",
  }],
}
```

这表示模型提出了一次调用请求：

- `name` 用来找到本地注册的工具。
- `args` 是模型生成、需要校验的输入。
- `id` 标识这一次调用，用来关联后面的结果。

此时文件还没有被读取。`content` 为空也不等于没有输出，因为模型把下一步行动写进了 `tool_calls`。同一条响应也可能同时包含文本和调用请求。

## 4. 从调用请求到执行结果

应用拿到调用请求后，要执行工具，再把结果组织成模型能接收的消息。LangChain 用四类消息表达本节的对话：

| 消息 | 含义 |
|---|---|
| `SystemMessage` | 应用设定的行为指令 |
| `HumanMessage` | 用户提问 |
| `AIMessage` | 模型响应，可能包含文本或工具调用请求 |
| `ToolMessage` | 某一次工具调用的执行结果 |

下面继续使用上一节的 `response`，展示一次成功调用的回填过程。这是只处理第一个请求的说明片段，完整循环在下一节。

```ts
import { ToolMessage } from "@langchain/core/messages";

messages.push(response);
const call = response.tool_calls?.[0];

if (call?.name === readFileTool.name && call.id) {
  const args = await readFileTool.schema.parseAsync(call.args);
  const content = await readFileTool.invoke(args);

  messages.push(new ToolMessage({
    content,
    name: call.name,
    tool_call_id: call.id,
  }));
}
```

这里显式解析参数，让运行时校验这一步可见；工具的 `invoke` 本身也会校验输入。对于本节这个返回字符串的工具，传入参数对象后得到文件内容，再显式创建 `ToolMessage`，能清楚地看到调用 ID 如何回填。

LangChain 也支持把完整的调用对象交给 `tool.invoke(call)`：携带有效调用 ID 时，它会把普通返回值包装成关联的 `ToolMessage`。这两种形式的返回值不能混为一谈；应根据实际传入的对象和工具返回类型处理。[官方执行示例](https://docs.langchain.com/oss/javascript/langchain/models#tool-calling)

为什么结果需要 `tool_call_id`？因为同一个工具可以被调用多次：读取 A 和读取 B 都叫 `read_file`，只有工具名无法区分。结果里的 `tool_call_id` 必须匹配原调用的 `id`。[官方消息文档](https://docs.langchain.com/oss/javascript/langchain/messages#tool-message)

发回模型的历史因此变成：

```text
SystemMessage：先读文件再回答
HumanMessage：请读取文章
AIMessage：read_file(...), id = call_read_1
ToolMessage：文章内容, tool_call_id = call_read_1
```

随后再次执行 `modelWithTools.invoke(messages)`，模型才有机会基于文件内容回答。请求里既要有调用，也要有对应结果：调用消息排在结果消息之前，每个调用都需要得到相应的结果消息。

## 5. 把一次调用扩展成循环

模型读完文件后，可能直接回答，也可能发现还需要另一份文件。应用不能把流程写死成“读一次就结束”，而要检查每次响应是否仍带有调用请求。

以下是核心循环，沿用前面定义的 `modelWithTools`、`readFileTool` 和初始 `messages`，从第一次模型请求开始运行。**阅读时用它替换前两节的调用与回填片段，避免重复发送请求。** 完整 AI 参考代码见 [AI 参考代码](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/01-langchain-tools/explainer/examples/index.ts)。

```ts
let response = await modelWithTools.invoke(messages);
messages.push(response);

while (response.tool_calls?.length) {
  for (const call of response.tool_calls) {
    if (!call.id) throw new Error("工具调用缺少 id，无法关联结果");

    let content: string;
    try {
      if (call.name !== readFileTool.name) {
        throw new Error(`未注册的工具：${call.name}`);
      }
      const args = await readFileTool.schema.parseAsync(call.args);
      content = await readFileTool.invoke(args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      content = `工具执行失败：${reason}`;
    }

    messages.push(new ToolMessage({
      content,
      name: call.name,
      tool_call_id: call.id,
    }));
  }

  response = await modelWithTools.invoke(messages);
  messages.push(response);
}

if (response.invalid_tool_calls?.length) {
  throw new Error("模型返回了无法解析的工具调用");
}
console.log("最终回复：", response.content);
```

`while` 的条件直接对应这条规则：**只要模型还提出工具调用，就继续执行、回填，再请求模型。** 没有新的调用请求时，循环结束并打印回答。

执行一轮工具调用时，内部的 `for` 遍历这次响应中的所有请求；外部的 `while` 负责多轮模型交互。每次 `invoke` 后都立即保存 `AIMessage`，随后才追加对应的工具结果。

文件不存在、参数校验失败和未知工具名会形成带原调用 ID 的结果消息，让模型获得反馈。缺少调用 ID 则无法关联结果，程序直接报错。`invalid_tool_calls` 表示无法解析的调用，例如参数 JSON 解析失败；模型请求本身失败也会终止程序。

这个学习示例保留最基本的循环，选择串行执行工具，便于观察时序。实际应用还应补充调用次数或时间上限，避免模型持续请求工具；路径范围和文件大小等限制也需要由应用控制。

## 6. 多轮与并行调用如何保持对应关系

### 多轮：新请求也必须先进入历史

假设模型先读 `main.ts`，发现它引用了 `config.ts`，于是下一轮继续读取。下面用 `AI` 和 `Tool` 简写消息类型，省略最初的系统指令和提问：

```text
第 1 次模型请求后
[ AI₁(read main.ts, id=A) ]

执行并回填
[ AI₁(..., id=A), Tool(main.ts 内容, tool_call_id=A) ]

第 2 次模型请求后
[ AI₁, Tool_A, AI₂(read config.ts, id=B) ]

执行并回填
[ AI₁, Tool_A, AI₂(..., id=B), Tool(config.ts 内容, tool_call_id=B) ]

第 3 次模型请求后
[ AI₁, Tool_A, AI₂, Tool_B, AI₃(最终回答) ]
```

如果漏存 `AI₂`，后面的 `Tool_B` 就找不到对应请求，消息历史会违反工具调用协议。因此，第一次调用模型和 `while` 内再次调用模型后，都要执行 `messages.push(response)`。

这种随执行积累的消息历史称为**执行轨迹（Trajectory）**。本例的消息数组不断追加，但“永远只追加”不是所有 Agent 的要求：长任务可能需要裁剪或总结历史，同时保持调用与结果的有效关联。

### 并行：一次响应可以提出多个独立请求

模型一次返回两个调用，例如分别读取 A 和 B，应用可以用 `Promise.all` 并发执行。这要由应用决定：两个独立读取通常适合并发，“创建文件后读取它”则存在顺序依赖。

无论完成顺序如何，每条结果都通过自己的 `tool_call_id` 关联请求。`Promise.all` 的返回数组保留输入顺序，但关联的依据仍然是 ID。在这组调用的结果全部回填后，再请求模型继续判断。

**并行调用**是同一次模型响应里有多个请求；**多轮调用**是模型看到上一批结果后，又生成新的请求。二者可以同时存在。

## 7. 这个循环在 Agent 中处于什么位置

《AI Agent Book》用“**Agent = LLM + 上下文 + 工具**”描述最小工程组成：模型负责决策，上下文提供决策时可见的信息，工具连接外部操作。把这些部分组织起来、维护运行并实施约束的外围工程层，称为 **Harness**。本节的消息维护、工具执行和循环控制就是其中的一小部分。[参考书第一章](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter1.md)

书中介绍的 **ReAct（Reasoning + Acting）**强调推理、行动与观察交替推进任务。这里可以用这个视角理解：模型决定读取文件，程序执行读取，结果进入上下文，模型继续判断。工具调用消息展示了行动请求，并不要求模型向用户公开内部思考过程。

LangChain 当前使用 `createAgent` 创建封装好的 Agent 循环：

```ts
// 独立的用法示意；需安装 langchain，并复用前文的 model 和 readFileTool。
import { createAgent } from "langchain";

const agent = createAgent({
  model,
  tools: [readFileTool],
  systemPrompt: "你是代码助手。涉及文件实际内容时，先读取文件再回答。",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "请读取 ./explainer/readme.md 并概括。" }],
});
console.log(result.messages.at(-1)?.content);
```

`createAgent` 负责组织模型与工具之间的循环，并支持用 middleware 等机制控制行为；它基于 LangGraph 运行。本节手写循环是为了看清这一过程。需要自行定义节点、分支和状态流转时，可以进一步学习 LangGraph。[官方 Agent 文档](https://docs.langchain.com/oss/javascript/langchain/agents)

下面几个概念处理不同的问题，后续课程会逐步展开：

| 概念 | 主要解决什么 | 与本节的联系 |
|---|---|---|
| 工具调用 | 让模型提出结构化操作请求，由执行方完成操作 | 本节的请求、执行、回填机制 |
| 结构化输出（Structured Output） | 让最终输出符合指定 schema | 可以只提取数据而不执行外部操作；工具调用也可作为结构化输出的一种实现机制 |
| 检索增强生成（RAG） | 检索相关资料并用于生成回答 | 检索可以由固定流程执行，也可以作为工具交给 Agent 按需调用 |
| 模型上下文协议（MCP） | 标准化应用与工具、资源等能力提供方的连接 | MCP 服务可以提供工具，应用接入后再供模型调用 |

## 8. 运行与观察

代码仓库：[learn-ai](https://github.com/liujiaqi222/learn-ai)。本章位于 [01-Tools/projects/01-langchain-tools](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/01-langchain-tools)。

完整示例见 [AI 参考代码](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/01-langchain-tools/explainer/examples/index.ts)。它使用本项目已有的 `@langchain/core`、`@langchain/openai` 和 `zod`，不依赖 `langchain` 包；上一节的 `createAgent` 只是后续框架用法的说明。

下载仓库后，进入本章目录安装依赖：

```bash
git clone https://github.com/liujiaqi222/learn-ai.git
cd learn-ai/01-Tools/projects/01-langchain-tools
bun install
cp -n .env.example .env  # 首次配置，保留已有 .env
```

编辑 `.env`，填写模型名称、密钥和服务地址：

```dotenv
MODEL_NAME=支持工具调用的模型名称
API_KEY=你的密钥
BASE_URL=提供商的兼容接口地址
```

Bun 自动加载当前工作目录的 `.env`，无需添加 dotenv。示例启动时检查这三个变量是否已填写；相对文件路径也以当前工作目录为基准。

```bash
bun explainer/examples/index.ts
```

这条命令会调用你配置的真实模型，消耗相应额度。观察日志时，关注以下证据：

1. 模型是否实际返回了 `read_file` 调用请求。
2. 程序是否执行读取，并打印本次调用的 ID 和字符数。
3. 回填后模型是否基于文章内容继续回答，还是要求新的调用。

下面只是预期形态，具体轮数、ID 和回答都可能变化：

```text
请求模型
执行 read_file，调用 ID：call_...
读取成功，字符数：...
请求模型
最终回复：这篇文章介绍了……
```

没有出现调用记录、却生成了看似合理的摘要，不能证明模型读过文件。同样，没有更多调用请求只代表模型停止行动，最终回答是否符合任务还需要检查。

准备把示例用于更广的输入时，需要增加允许读取的目录或文件清单、真实路径检查（包括符号链接）、文件类型与大小限制。文件内容属于外部输入，即使包含指令，也不能因此获得执行权限。工具错误反馈也应避免泄露无关的敏感信息。



## 9. 复习与自测

快速回顾时，先在脑中走完这一条链：

```text
定义工具 → bindTools → 模型返回 AIMessage(tool_calls)
→ 保存 AIMessage → 校验参数并执行工具
→ 追加带对应 ID 的 ToolMessage → 再次请求模型
→ 没有调用请求时输出回答，否则继续下一轮
```

记住三个区别：**工具定义不等于函数实现，调用请求不等于已经执行，模型停止调用不等于任务已经完成。**

先尝试自己回答，再展开解析：

<details>
<summary>1. 只调用 bindTools，然后打印第一次响应的 content，为什么可能什么也看不到？</summary>

模型可能把下一步操作写在 `tool_calls` 中，文本内容为空。绑定工具只提供定义，应用还需要执行请求、回填结果，再次调用模型。

</details>

<details>
<summary>2. 同一轮读两个文件，为什么不能只凭 read_file 这个名字回填结果？</summary>

两个请求的工具名相同，但参数和调用 ID 不同。每条 `ToolMessage` 用 `tool_call_id` 对应具体请求，才能明确是哪次读取的结果。

</details>

<details>
<summary>3. 第一轮正常，第二轮漏存 AIMessage，为什么后续可能被接口拒绝？</summary>

第二轮结果引用的调用没有出现在历史中。应在每轮收到响应后先保存它，再执行和追加对应结果。

</details>

<details>
<summary>4. 参数是合法 JSON，就一定能成功读取文件吗？</summary>

还要满足工具 schema，例如 `filePath` 必须是字符串；即使校验通过，也可能遇到文件不存在、权限不足等执行错误。结构校验、权限控制和实际执行是不同环节。

</details>

<details>
<summary>5. “工具执行失败”为什么有时也要发回模型？什么错误在本例中直接终止？</summary>

反馈让模型知道操作没有成功，有机会换路径或向用户解释。本例回填能关联到调用的执行错误；缺少调用 ID、无法解析调用或模型请求失败时直接终止。

</details>

<details>
<summary>6. 读完 A 才知道 B 的路径，能否把两次读取放进同一次 Promise.all？</summary>

不能直接这样做，因为第二次读取依赖第一次结果。需要先把 A 的结果交回模型，由下一轮生成读取 B 的请求；已知路径的独立读取才适合并发。

</details>

## 参考资料

- API 与运行机制：[LangChain Tools](https://docs.langchain.com/oss/javascript/langchain/tools)、[Models / Tool calling](https://docs.langchain.com/oss/javascript/langchain/models#tool-calling)、[Messages](https://docs.langchain.com/oss/javascript/langchain/messages)、[Agents](https://docs.langchain.com/oss/javascript/langchain/agents)。
- 概念与术语：[《深入理解 AI Agent：设计原理与工程实践》第一章](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter1.md)中的 Agent 组成、Model–Harness 结构、工具调用与 ReAct 循环。
- API 核验日期：2026-11-04。示例对照本项目安装的 `@langchain/core`、`@langchain/openai` 与 Zod 类型及实现核验；项目依赖范围见 [package.json](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/01-langchain-tools/package.json)。
