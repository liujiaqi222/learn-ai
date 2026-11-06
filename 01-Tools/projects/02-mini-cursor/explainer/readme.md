# 实现 mini cursor：让模型写代码、运行，再根据结果修改

让模型生成一段代码以后，你通常还要自己创建文件、复制进去、执行命令，再把报错贴回对话。如果把读写文件和执行命令也做成工具，这些来回操作就可以交给同一个 Agent 完成。

本章实现这样一个代码助手。先用一个小任务跑通整个过程：**创建 `greeting.ts`，读回文件，执行后输出 `hello mini cursor`。**

本章的重点是命令工具：`spawn` 如何启动子进程，怎样收集输出，以及为什么要用 Promise 等它结束。文件工具和工具调用循环沿用已有写法，接到这条主线上即可。

## 阅读导航

- [1. 从读文件到代码助手](#1-从读文件到代码助手)
- [2. 先把命令执行讲清楚](#2-先把命令执行讲清楚)
- [3. 把文件与命令封装成工具](#3-把文件与命令封装成工具)
- [4. 用 while 接起模型和工具](#4-用-while-接起模型和工具)
- [5. 跑通创建、读取和执行](#5-跑通创建读取和执行)
- [6. 报错以后怎样继续](#6-报错以后怎样继续)
- [7. 复习与练习](#7-复习与练习)
- [参考资料](#参考资料)

## 1. 从读文件到代码助手

只有读文件工具时，模型可以观察项目；增加写文件和执行命令，它就能修改项目，并从运行结果决定下一步。

| 工具 | 在代码助手中的作用 |
|---|---|
| `list_directory` | 看目录里有哪些文件 |
| `read_file` | 读取现有实现或检查刚写入的内容 |
| `write_file` | 创建文件，或用新内容覆盖文件 |
| `exec_command` | 运行程序，返回输出和退出状态 |

用户只描述任务。模型根据工具定义提出操作，应用执行操作，再把结果交回模型。比如一次任务可以这样推进：

```text
用户要求创建并运行 greeting.ts
    ↓
模型请求 write_file，应用写入代码
    ↓
模型请求 read_file，应用返回文件内容
    ↓
模型请求 exec_command，应用运行程序并返回输出
    ↓
模型根据运行结果回复，或继续修改
```

代码里的控制流程固定为“请求模型 → 执行工具 → 回填结果 → 再请求模型”，具体执行哪些步骤由模型根据任务和反馈选择。[LangChain 工具调用](https://docs.langchain.com/oss/javascript/langchain/models#tool-calling)

## 2. 先把命令执行讲清楚

先解决本章新增的能力：在应用中执行命令，并拿回执行结果。我们从启动一个子进程开始，再把输出和结束事件接成一个可 `await` 的函数。

### 启动程序，并接通它的输出

`spawn` 来自 Node.js 的 `child_process` 模块，Bun 也支持这一 API。先看一个能单独实验的例子：让子进程列出当前目录。

```ts
import { spawn } from "node:child_process";

const child = spawn("ls -la", {
  cwd: process.cwd(),
  shell: true,
  stdio: "inherit",
});
```

`cwd` 指定运行目录，这里使用当前应用的目录；`shell: true` 把命令字符串交给 shell 解释。`stdio: "inherit"` 让子进程直接使用当前终端，运行时就能看到目录列表。

`spawn` 返回的 `child` 是子进程对象。它在命令刚启动时就返回，命令可能还在运行。我们通过这个对象接收输出、监听结束事件。

终端实验跑通后，要把输出收集成工具结果，需要把 `stdio` 改为：

```ts
stdio: ["ignore", "pipe", "pipe"]
//        stdin    stdout  stderr
```

三个位置分别对应标准输入（stdin）、标准输出（stdout）、标准错误（stderr）。`ignore` 表示不提供交互输入，两个 `pipe` 让应用可以读取两条输出流：

| 子进程中的操作 | 当前应用从哪里接收 |
|---|---|
| `console.log("你好")` | `child.stdout`：标准输出流 |
| `console.error("发生了一个问题")` | `child.stderr`：标准错误输出流 |

这两条流彼此独立。`inherit` 让人直接在终端看到输出，`pipe` 让应用能读取、保存，再把文字交给模型。[Node.js stdio 说明](https://nodejs.org/api/child_process.html#optionsstdio)

### 把陆续到达的数据收集成文本

“流”意味着数据可以分块到达。默认收到的每块数据是 `Buffer`，即二进制字节；我们希望直接处理字符串，因此先设置 UTF-8 编码，再监听 `data` 事件：

```ts
let stdout = "";

child.stdout.setEncoding("utf8");
child.stdout.on("data", (text: string) => {
  stdout += text;
});
```

这几行做了两件事：`setEncoding` 告诉这条流怎样把字节解码成文本；`on("data", ...)` 注册回调，每来一块文本就把它追加到变量中。**`child.stdout` 是接收数据的流对象，`stdout` 是我们用来保存结果的字符串。**

例如先收到 `"hello "`，再收到 `"mini cursor\n"`，最终就拼成 `"hello mini cursor\n"`。这是分块示意，实际边界不保证按单词、按行或按每次 `console.log` 划分。

标准错误需要同样的处理，但保存在另一个变量里：

```ts
let stderr = "";

child.stderr.setEncoding("utf8");
child.stderr.on("data", (text: string) => {
  stderr += text;
});
```

所以两次 `setEncoding("utf8")` 分别配置两个流，给 `stdout` 设置编码不会影响 `stderr`。流还会处理跨数据块的多字节字符：一个汉字的字节可能分两次到达，解码器会等字节补齐后再交出完整字符，避免逐块独立解码产生乱码。[Node.js setEncoding 说明](https://nodejs.org/api/stream.html#readablesetencodingencoding)

### 等待结束，再决定如何返回

收集输出以后，还要确定何时交出结果。这里有两个关键事件：`error` 用于处理启动等操作异常，例如 `cwd` 不存在导致 shell 无法启动；`close` 则表示进程已经结束，相关标准输入输出流也已经关闭。

仅监听 `exit` 还不够，因为进程退出时输出流可能尚未关闭。本例等待 `close`，让正常执行路径中的输出收集完成后再返回。[Node.js close 事件说明](https://nodejs.org/api/child_process.html#event-close)

为了让调用方可以 `await`，我们把整个过程放进一个 Promise：在 `error` 回调中用 `reject(error)` 让等待中的调用抛错，在 `close` 回调中用 `resolve(result)` 交出结果。结果保留四项信息：

| 字段 | 含义 |
|---|---|
| `stdout` | 收集到的标准输出文本 |
| `stderr` | 收集到的标准错误文本 |
| `exitCode` | 退出码；通常 `0` 表示成功，非零表示失败 |
| `signal` | 因信号终止时的终止信号，此时退出码可能为 `null` |

要区分“启动异常”和“命令执行后报告失败”。shell 启动以后，里面的命令报错通常会返回非零退出码，仍应保留输出作为结果；`stderr` 有内容也不能单独判定失败，因为一些程序用它显示警告或进度。

### 把这些步骤合成完整函数

现在把启动、收集和返回放在一起。下面是完整实现，逻辑与 [exec-command.ts](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/02-mini-cursor/explainer/examples/exec-command.ts) 一致，注释只标出几个执行阶段：

```ts
import { spawn } from "node:child_process";

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

function execCommand(command: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // 启动子进程，接通两条输出流。
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // 分别解码并收集标准输出、标准错误。
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      stdout += text;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) => {
      stderr += text;
    });

    // 启动异常让调用方的 await 抛错。
    child.on("error", (error) => {
      reject(error);
    });

    // 进程结束、输出流关闭后，返回收集结果和退出状态。
    child.on("close", (exitCode, signal) => {
      resolve({ stdout, stderr, exitCode, signal });
    });
  });
}
```

现在调用 `const result = await execCommand("bun greeting.ts", cwd)`，就会等到 `close` 中的 `resolve` 才取得正常结果，或在 `reject` 时抛错。直接 `await spawn(...)` 没有这个等待效果，因为子进程对象本身不是代表命令完成的 Promise。

这就把完整过程接了起来：**启动子进程 → 分别收集输出 → 等待进程和输出流结束 → 返回文本与退出状态。** 应用还要把结果放进工具消息，模型才能据此判断下一步。

这里使用完整 shell 命令字符串，因此设置 `shell: true`。如果已经知道可执行程序及参数，也可以用 `spawn(executable, args, { shell: false })`；不要用 `command.split(" ")` 模拟 shell 解析，它无法正确处理引号中的空格等语法。[Node.js spawn](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)

## 3. 把文件与命令封装成工具

命令执行函数准备好后，把它和文件操作一起包装成 LangChain 工具。四个工具共用一个工作区：模型传相对路径，应用用 `path.resolve(rootDirectory, 路径)` 定位文件或目录。

| 工具名称 | 参数 | 返回内容 |
|---|---|---|
| `read_file` | `filePath` | UTF-8 文件文本 |
| `write_file` | `filePath`、`content` | 写入完成提示 |
| `list_directory` | `directoryPath` | 用换行分隔的直接条目名称 |
| `exec_command` | `command`、可选的 `workingDirectory` | 目录、输出、退出码和信号 |

文件工具仍然使用 `tool(执行函数, 工具定义)`。以写文件为例，下面的定义放在 `createFileTools(rootDirectory)` 内部：

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const writeFile = tool(
  async ({ filePath, content }) => {
    const target = path.resolve(rootDirectory, filePath);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");

    return `已写入 ${filePath}`;
  },
  {
    name: "write_file",
    description: "写入完整文本，自动创建父目录；已有文件会被覆盖。",
    schema: z.object({
      filePath: z.string(),
      content: z.string(),
    }),
  },
);
```

`mkdir` 先准备父目录，因此可以直接写入 `src/greeting.ts`。读文件和列目录的执行函数分别是下面两段，工具名称和 schema 按上表定义：

```ts
// read_file 的执行函数
async ({ filePath }) => {
  return fs.readFile(path.resolve(rootDirectory, filePath), "utf8");
}

// list_directory 的执行函数
async ({ directoryPath }) => {
  const entries = await fs.readdir(path.resolve(rootDirectory, directoryPath));
  return entries.sort().join("\n");
}
```

`createFileTools` 返回 `[readFile, writeFile, listDirectory]`。完整定义见 [tools.ts](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/02-mini-cursor/explainer/examples/tools.ts)。

### 命令工具每次都要确定目录

文件路径和命令目录要使用同一个基准。例如工作区下有一个 `app` 项目：

```text
rootDirectory：/tmp/workspace
command：bun run build
workingDirectory：app
实际执行目录：/tmp/workspace/app
```

这次命令已经从 `app` 目录开始执行，再写 `cd app` 就会进入 `app/app`。而且每次调用都创建新子进程，上一次 shell 的 `cd` 不会改变下一次命令的目录。

因此，命令工具根据本次的 `workingDirectory` 计算 `cwd`，并把执行目录一并返回：

```ts
const execTool = tool(
  async ({ command, workingDirectory }) => {
    const cwd = path.resolve(rootDirectory, workingDirectory ?? ".");
    const result = await execCommand(command, cwd);

    return JSON.stringify({ cwd, ...result });
  },
  {
    name: "exec_command",
    description: "在指定目录运行会结束的 shell 命令，返回输出与退出状态。",
    schema: z.object({
      command: z.string(),
      workingDirectory: z.string().optional(),
    }),
  },
);
```

`createTools(rootDirectory)` 最后返回 `[...createFileTools(rootDirectory), execTool]`，这样四个工具就准备好了。

## 4. 用 while 接起模型和工具

工具准备好以后，先绑定到模型，让它知道有哪些操作可选：

```ts
const tools = createTools(workspace);
const modelWithTools = model.bindTools(tools);
```

模型在 `response.tool_calls` 中返回工具名、参数和调用 ID。执行器按名称查找工具，传入完整调用对象执行，结果就会带上对应的 `tool_call_id`：

```ts
// executeToolCalls(calls, tools) 的核心，省略错误处理。
const results: ToolMessage[] = [];

for (const call of calls) {
  const selected = tools.find((tool) => tool.name === call.name);

  if (!selected) {
    throw new Error(`未注册的工具：${call.name}`);
  }

  results.push(await selected.invoke({ ...call, type: "tool_call" }));
}

return results;
```

这里逐条 `await`，保留先写文件、再读取或执行的顺序。完整的 [dispatch-tools.ts](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/02-mini-cursor/explainer/examples/dispatch-tools.ts) 还会把单条调用的异常转成错误消息。[官方工具执行示例](https://docs.langchain.com/oss/javascript/langchain/models#tool-calling)

接下来就是循环。`runAgent(query, model, execute, systemText)` 接收任务、已绑定工具的模型、执行函数和系统说明，其核心过程如下，省略了无效调用检查：

```ts
const messages: BaseMessage[] = [
  new SystemMessage(systemText),
  new HumanMessage(query),
];

let response = await model.invoke(messages);
messages.push(response);

while (response.tool_calls?.length) {
  const toolResults = await execute(response.tool_calls);
  messages.push(...toolResults);

  response = await model.invoke(messages);
  messages.push(response);
}

return messages;
```

消息类型来自 `@langchain/core/messages`。关键是每轮都先保存模型回复，再追加工具结果，让下一次请求看到完整历史：

```text
Human(任务)
→ AI(write_file, id=A)
→ Tool(已写入, tool_call_id=A)
→ AI(exec_command, id=B)
→ Tool(命令输出, tool_call_id=B)
→ AI(最终回复)
```

没有工具请求时，循环结束，最后一条模型消息就是最终回复。完整的 [run-agent.ts](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/02-mini-cursor/explainer/examples/run-agent.ts) 还会检查 `invalid_tool_calls`，对无法解析的调用明确报错。

## 5. 跑通创建、读取和执行

现在把工作区、模型和循环组装起来。入口位于 [mini-cursor.ts](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/02-mini-cursor/explainer/examples/mini-cursor.ts)，主要接线如下；省略了配置检查和工具结果日志：

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import type { ToolCall } from "@langchain/core/messages";
import { createTools } from "./tools";
import { executeToolCalls } from "./dispatch-tools";
import { runAgent } from "./run-agent";

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mini-cursor-agent-"));
const tools = createTools(workspace);
console.log("工作区：", workspace);

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME!,
  apiKey: process.env.API_KEY!,
  configuration: { baseURL: process.env.BASE_URL! },
});
const modelWithTools = model.bindTools(tools);

async function execute(calls: ToolCall[]) {
  return executeToolCalls(calls, tools);
}

const query =
  "创建 greeting.ts，运行后应输出 hello mini cursor。读取文件并执行验证，然后报告实际结果。";
const systemText = `你是代码助手，工作区是 ${workspace}。
所有相对路径以它为基准，每条命令单独指定 workingDirectory。
运行 TypeScript 时使用 ${process.execPath}，仅运行会结束的命令。`;

const messages = await runAgent(query, modelWithTools, execute, systemText);
console.log("最终回复：", messages.at(-1)?.content);
```

`mkdtemp` 创建一个带随机后缀的新目录；`process.execPath` 提供当前 Bun 的可执行文件路径。这样，文件工具和命令工具操作同一个工作区，模型也知道该用什么运行 TypeScript。

### 下载与运行

从 [learn-ai 仓库](https://github.com/liujiaqi222/learn-ai) 下载代码，进入本章目录：

```bash
git clone https://github.com/liujiaqi222/learn-ai.git
cd learn-ai/01-Tools/projects/02-mini-cursor
bun install
cp -n .env.example .env
```

填写 `.env`，Bun 会自动加载：

```dotenv
MODEL_NAME=支持工具调用的模型名称
API_KEY=你的密钥
BASE_URL=提供商的兼容接口地址
```

启动 AI 参考实现，这一步会调用配置的模型：

```bash
bun explainer/examples/mini-cursor.ts
```

观察终端打印的工作区和工具结果。一次成功执行可能包含下面这些操作，调用顺序和 ID 为示意：

| 调用 | 参数要点 | 返回内容 |
|---|---|---|
| `write_file` | `greeting.ts`，内容为 `console.log("hello mini cursor");` | `已写入 greeting.ts` |
| `read_file` | `greeting.ts` | 刚写入的代码 |
| `exec_command` | 用 Bun 运行 `greeting.ts`，目录为 `.` | `stdout` 包含目标文本，`exitCode` 为 `0` |

其中命令工具返回的文本可以解析成下面这样的对象，路径为示意：

```json
{
  "cwd": "/tmp/mini-cursor-agent-example",
  "stdout": "hello mini cursor\n",
  "stderr": "",
  "exitCode": 0,
  "signal": null
}
```

任务结束后，打开终端打印的工作区，就能看到生成的 `greeting.ts`。这个文件会保留在临时目录中，便于检查。

参考代码只有一个启动入口，其余文件由入口直接或间接导入：

| 文件 | 职责 |
|---|---|
| `mini-cursor.ts` | 创建工作区和模型，组装并启动任务 |
| `exec-command.ts` | 收集子进程输出，等待命令结束 |
| `tools.ts` | 定义四个工具 |
| `dispatch-tools.ts` | 执行调用，关联结果消息 |
| `run-agent.ts` | 维护历史，用 while 继续执行 |

## 6. 报错以后怎样继续

成功执行只是闭环中的一条路径。假设第一次写入时，把 `console.log` 写成了 `console.logg`：

```ts
console.logg("hello mini cursor");
```

Bun 执行后会报 `TypeError`。命令工具会把报错放进 `stderr`，连同非零退出码交回模型，下一轮就可以针对这个错误修改：

```text
write_file：写入 console.logg(...)
    ↓
exec_command：stderr 提示 console.logg 有误，exitCode 非零
    ↓
模型根据报错提出 write_file：改为 console.log(...)
    ↓
exec_command：stdout 为 hello mini cursor，exitCode 为 0
    ↓
模型回复结果
```

这就是自动修改的依据：运行环境产生反馈，应用把反馈加入上下文，模型再提出下一步操作。读文件、列目录用于观察环境，写文件和命令用于改变环境，这也对应《AI Agent Book》对感知工具与执行工具的划分。[第四章：工具](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)

工作区路径用于定位文件，文件访问和命令执行仍使用当前进程的权限。下一节学习 MCP，把这些工具通过标准协议提供给其他进程调用。

## 7. 复习与练习

本章的执行链可以从两个角度复习：

- 命令内部：`spawn` 启动 → `data` 收集输出 → `close` 兑现 Promise。
- Agent 外部：模型提出调用 → 应用执行 → 结果加入历史 → 模型继续判断。

下面的问题能检验你是否把两条链接在了一起：

<details>
<summary>1. 为什么只在终端看到报错，模型还无法据此修改？</summary>

终端输出要先被应用收集，并放进工具结果，再加入消息历史，才会出现在下一次模型请求里。

</details>

<details>
<summary>2. stdout 和 stderr 为什么分别设置编码、分别收集？</summary>

它们是两条独立的流。每条流分别解码成文本，分别积累到对应变量；stderr 也可能包含警告或进度。

</details>

<details>
<summary>3. workingDirectory 已设为 app，command 中再写 cd app 会怎样？</summary>

命令已经从 app 中执行，再 cd app 会尝试进入 app/app。每次工具调用都应独立指定本次执行目录。

</details>

<details>
<summary>4. 命令返回结果后，为什么还要再次请求模型？</summary>

工具只返回执行结果。模型需要读取这个结果，决定继续检查、修改、再次执行，还是给出最终回复。

</details>

独立练习分别对应文件工具、命令执行、工具分发和多轮循环，在本章目录运行：

```bash
bun test problem/01-file-tools
bun test problem/02-exec-command
bun test problem/03-dispatch-tools
bun test problem/04-agent-loop
```

测试使用临时文件、本地命令和脚本化模型，无须 API key。初始 TODO 未完成时测试失败是预期状态。完成后再对照 [AI 参考代码](https://github.com/liujiaqi222/learn-ai/tree/main/01-Tools/projects/02-mini-cursor/explainer/examples)，整体实操写在自己的 `solution/` 中。

## 参考资料

- [Node.js child_process](https://nodejs.org/api/child_process.html)：`spawn`、stdio 与进程事件。
- [Node.js Stream / setEncoding](https://nodejs.org/api/stream.html#readablesetencodingencoding)：字节解码与多字节字符。
- [LangChain Tools](https://docs.langchain.com/oss/javascript/langchain/tools) 与 [Models / Tool calling](https://docs.langchain.com/oss/javascript/langchain/models#tool-calling)：工具定义、绑定、执行与结果消息。
- [《深入理解 AI Agent：设计原理与工程实践》第四章](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)：工具与环境交互。
- 核对日期：2026-11-07。代码对照本章安装的依赖，版本范围见 [package.json](https://github.com/liujiaqi222/learn-ai/blob/main/01-Tools/projects/02-mini-cursor/package.json)。
