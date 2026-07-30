# MCP：让 Tool 跨进程调用 -- 把工具从 Agent 进程里拆出去

> 这里是 AI 整理的系统讲解。完整参考代码放在
> [`examples/`](./examples/)；它用于最后对照，不是你的作答。
> 你跟着原文写的代码放在 `../solution/`，独立测评放在 `../problem/`。

前两课的工具都是写在 Agent 同一个进程里的 Node 函数：`read_file`、`exec_command`、`query_user`……模型只要一调，本进程里直接跑。但这有个硬限制--**你的 Agent 是 Node 写的，工具就得是 Node 写的**。如果某个能力是 Python、Java、Rust 实现的呢？如果你想写一次工具，让 Cursor、Claude Desktop、自己的 LangChain Agent **都能复用**呢？

MCP（Model Context Protocol，模型上下文协议）就是解决这个问题的：它把「工具 / 资源 / 提示词」标准化成一套跨进程协议。写一次 MCP Server，任何 MCP Client 都能接。

> 本文沿袭前两课的风格：不逐行翻译代码，重点讲 **MCP 到底解决什么、架构怎么分层、三原语怎么区分**，然后动手写一个 Server 并分别接进 Cursor 和 LangChain。术语以 [官方文档](https://modelcontextprotocol.io/docs/getting-started/intro) 为准。

---

## 1. 为什么需要 MCP：工具被困在进程里

前两课的工具长这样（02 的 `tools.ts`）：

```ts
const readFileTool = tool(async ({ filePath }) => {
  return await fs.readFile(filePath, 'utf-8')
}, { name: 'read_file', schema: z.object({ filePath: z.string() }) })
```

它和 Agent 跑在同一个 Node 进程里。模型调工具 = 本进程函数调用。简单、快、零通信成本。**当你不需要跨进程时，就该这样写**（02 已经讲透）。

但有两类场景它搞不定：

1. **跨语言**：团队里已有的工具是 Python / Java 写的，你不想用 Node 重写一遍。
2. **跨应用复用**：你想写一个「查用户」工具，让 Cursor 也能用、自己的 Agent 也能用、Claude Desktop 也能用。总不能每个应用各写一份。

### 朴素方案：自己起进程通信

- **子进程 + 标准输入输出（stdio）**：Agent 起一个子进程跑那段别的语言代码，靠 stdin/stdout 传数据。
- **HTTP 服务**：把工具包成本地 HTTP 服务，Agent 发请求。

这两种都能跑，但**每家服务的接口格式都不一样**--你要接别人的工具，就得先读它的文档搞清楚它怎么定义参数、怎么返回。

### MCP：统一通信协议

MCP 做的事就是**把这套接口格式标准化**：不管本地还是远程、不管什么语言，大家都按同一个协议（基于 JSON-RPC 2.0）收发消息。

- 跨**本地**进程：用 **stdio** 传输（客户端把 server 当子进程拉起）。
- 跨**远程**进程：用 **Streamable HTTP** 传输（连远程服务进程）。
- 消息格式：两层架构，数据层统一是 JSON-RPC 2.0，传输层只管搬字节。

官方给了一个很贴切的类比：**MCP 之于 AI 应用，就像 USB-C 之于电子设备**--一个标准接口，插什么是什么。它由 Anthropic 发起并开源，现已是中立开放协议，被 Claude、ChatGPT、VS Code、Cursor 等广泛支持。

> 一句话：**MCP 本质还是 tool，只是给它套了一层「跨进程通信协议」**。不需要跨进程时，前两课那样直接写函数更好，还省了进程通信的成本。

---

## 2. 架构：Host / Client / Server / Transport

### 四个参与者

| 角色 | 是什么 | 例子 |
|---|---|---|
| **Host**（宿主） | 协调一个或多个 Client 的 AI 应用 | Cursor、Claude Desktop、VS Code、你的 LangChain Agent |
| **Client**（客户端） | Host 里负责和一个 Server 维持连接、获取上下文的组件 | 每个 Server 对应一个 Client 实例 |
| **Server**（服务端） | 暴露上下文（工具/资源/提示词）给 Client 的程序 | filesystem server、Sentry server、本课写的 user-info-server |
| **Transport**（传输） | Client 和 Server 之间搬消息的通道 | stdio（本地）、Streamable HTTP（远程） |

关键关系：**Host 给每个 Server 建一个 Client**。VS Code 连了 Sentry server 和 filesystem server，VS Code 运行时就会实例化两个 Client 对象，各自维持一条连接。

注意「Server」指的是**提供上下文的那个程序**，跟它跑在哪无关：Claude Desktop 拉起 filesystem server 跑在本机（stdio，叫**本地 server**）；官方 Sentry server 跑在 Sentry 平台（HTTP，叫**远程 server**）。

```
                    ┌─────────── Host（Cursor / Claude Desktop / LangChain Agent）───────────┐
                    │  Client A ──┐         Client B ──┐         Client C ──┐                 │
                    └─────────────┼─────────────────────┼──────────────────┼─────────────────┘
                                  │ stdio                │ Streamable HTTP │ stdio
                            ┌─────▼─────┐         ┌──────▼──────┐    ┌──────▼──────┐
                            │ 本地 Server│         │ 远程 Server  │    │ 本地 Server  │
                            │ (Node 子进程)│        │ (Sentry 平台) │    │ (本课写的)   │
                            └────────────┘         └──────────────┘    └─────────────┘
```

### 两层架构

MCP 分两层，这是理解它最关键的心智模型：

- **数据层（内层）**：基于 JSON-RPC 2.0 的协议，定义消息结构、生命周期管理、能力协商，以及三原语（tools / resources / prompts）。**开发者最关心的就是这层。**
- **传输层（外层）**：管通信通道和鉴权，负责连接建立、消息成帧（framing）、安全传输。它把通信细节从数据层抽象掉，使同一套 JSON-RPC 消息能跑在 stdio 或 HTTP 上。

换句话说：**数据层说「调哪个工具、传什么参数」，传输层说「字节怎么搬过去」**。两层解耦，所以换传输方式不用改业务逻辑。

### 生命周期：握手 → 能力协商 → 工作 → 关闭

MCP 是**有状态协议**，连接要先握手。Client 发 `initialize` 请求，双方协商：协议版本（如 `2025-06-18`）、各自支持哪些能力（capabilities）。握手成功后 Client 发 `notifications/initialized` 通知，进入正常工作。

```jsonc
// 1. Client → Server：初始化，声明自己支持 elicitation（让 server 反问用户）
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":"2025-06-18",
  "capabilities":{"elicitation":{}},
  "clientInfo":{"name":"my-agent","version":"1.0.0"}}}

// 2. Server → Client：声明自己支持 tools（且 listChanged）和 resources
{"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":"2025-06-18",
  "capabilities":{"tools":{"listChanged":true},"resources":{}},
  "serverInfo":{"name":"user-info-server","version":"1.0.0"}}}

// 3. Client → Server：通知「我准备好了」（通知没有 id，不期待响应）
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

`capabilities` 是核心：双方先亮明自己有哪些原语、支持哪些特性，避免之后调用对方不支持的东西。本课的 server 实测响应里就带了 `"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"listChanged":true}`。

---

## 3. 数据层：JSON-RPC 2.0 与三原语

### JSON-RPC 2.0 消息三种形态

| 类型 | 有 id？ | 要响应？ | 用途 |
|---|---|---|---|
| **Request** | ✅ | ✅ | 调用方法并等结果，如 `tools/call` |
| **Response** | ✅（回填请求 id） | 否 | 对 Request 的应答，含 `result` 或 `error` |
| **Notification** | ❌ | ❌ | 单向通知，如 `notifications/initialized` |

### 三原语（Server 暴露的）

这是 MCP 最重要的一组概念。Server 能暴露三种「积木」给 Client：

| 原语 | 是什么 | 谁控制 | 协议方法 | 典型例子 |
|---|---|---|---|---|
| **Tools**（工具） | 可执行函数，有类型化入参/出参 | **模型**（model-controlled） | `tools/list`、`tools/call` | 查数据库、发请求、改文件 |
| **Resources**（资源） | 只读数据源，按 URI 标识 | **应用**（application-driven） | `resources/list`、`resources/read`、`resources/templates/list` | 文件内容、DB schema、API 文档 |
| **Prompts**（提示词） | 可复用的提示模板 | **用户**（user-controlled） | `prompts/list`、`prompts/get` | 斜杠命令、固定工作流 |

「谁控制」这一列是三原语最本质的区别：

- **Tools 是 model-controlled**：模型根据对话上下文，**自己决定**要不要调、传什么参数。这正是前两课那套 `bindTools` + `tool_calls` 循环做的事。但出于安全，应用**应当**在敏感操作前弹确认（human-in-the-loop）。
- **Resources 是 application-driven**：模型**不会**自动读资源，而是**应用**决定何时读取、怎么塞进上下文（比如进 system message）。它像「可引用的文件」。
- **Prompts 是 user-controlled**：由**用户**在 UI 里显式选用（典型是敲 `/` 出来的斜杠命令），不会被模型自动触发。

> 一句话记忆：**Tool 是「做」（call，模型主动），Resource 是「读」（read，应用主动），Prompt 是「选」（get，用户主动）**。

除了 Server 暴露的三原语，协议还定义了 **Client 反向暴露给 Server 的原语**（本课用不到，知道即可）：**Sampling**（server 反向请求 host 的 LLM 推理，保持模型无关）、**Elicitation**（server 反问用户要更多信息/确认）、**Logging**（server 往 client 打日志）。

### 通知：能力是动态的

Server 声明了 `listChanged: true` 后，当它的工具/资源列表变化，会主动发 `notifications/tools/list_changed` 通知，Client 收到后重新 `tools/list` 刷新。这让 MCP 连接能适应「工具时有时无」的动态环境，不用轮询。

---

## 4. 传输层：stdio vs Streamable HTTP

### stdio（本地）

- Client 把 Server **当子进程拉起**。
- Server 从 **stdin** 读 JSON-RPC 消息，往 **stdout** 写消息。
- 消息**按换行分隔**，单条消息内不能有换行。
- **stderr** 留给日志（Client 可捕获/转发/忽略）。

> ⚠️ **stdio server 的头号致命坑**：stdout 是 JSON-RPC 的消息通道，**绝对不能往 stdout 写任何非协议内容**。在 Node 里就是**不能用 `console.log`**--它写 stdout，会污染消息流、让 Client 解析失败。要打日志用 `console.error`（写 stderr）。官方文档在每个语言的 quickstart 里都反复强调这条。HTTP server 不受此限（stdout 不参与 HTTP 响应）。

### Streamable HTTP（远程）

- Server 是**独立进程**，能服务多个 Client 连接。
- 一个 HTTP endpoint（如 `https://example.com/mcp`）同时支持 POST 和 GET。
- Client 用 **POST** 发 JSON-RPC 消息；Server 可选用 **SSE（Server-Sent Events）** 流式回多条消息。
- 支持会话管理（`Mcp-Session-Id` 头）、断线重连（`Last-Event-ID`）。
- 鉴权：推荐用 OAuth 取 token，支持 bearer token / API key / 自定义头。

> ⚠️ **远程 HTTP server 的安全坑**：必须校验 `Origin` 头、本地跑要绑 `127.0.0.1` 而非 `0.0.0.0`、必须实现鉴权。否则攻击者能用 DNS rebinding 从远程网站打到你的本地 server。本课只玩本地 stdio，不展开。

官方建议：**Client 应尽可能支持 stdio**。本课后续都用 stdio。

---

## 5. 动手：写一个 MCP Server

本课在 `03-mcp` 下写一个「用户信息」server，暴露一个工具、一个静态资源、一个资源模板、一个提示词--三原语一次覆盖。不依赖任何外部 API（内存假数据库），在哪都能跑、结果确定。

### 装包

```bash
bun add @modelcontextprotocol/sdk zod
```

包名 `@modelcontextprotocol/sdk` 本身就中立于任何模型厂商。还需要 `zod`--SDK 用它声明工具的参数 schema，会自动转成 JSON Schema 发给 Client。

### Server 代码（`mcp-server.ts`）

核心 API 就四个：`new McpServer({...})` 建实例，`registerTool` / `registerResource` / `registerPrompt` 注册三原语，`StdioServerTransport` 接上 stdio。逐段看：

```ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const database = {
  users: {
    "001": { id: "001", name: "张三", email: "zhangsan@example.com", role: "admin" },
    "002": { id: "002", name: "李四", email: "lisi@example.com", role: "user" },
    "003": { id: "003", name: "王五", email: "wangwu@example.com", role: "user" },
  },
};

const server = new McpServer({ name: "user-info-server", version: "1.0.0" });
```

**Tool**：`inputSchema` 是 zod 的「原始字段对象」`{ userId: z.string() }`，**不是** `z.object({...})`--SDK 内部会自动包成 JSON Schema。工具返回 `{ content: [{ type: "text", text }] }`，`content` 是数组，支持 text/image/audio/resource 等多种内容块。

```ts
server.registerTool(
  "query_user",
  {
    description: "查询数据库中的用户信息。输入用户 ID，返回该用户的姓名、邮箱、角色。",
    inputSchema: { userId: z.string().describe("用户 ID，例如 001、002、003") },
  },
  async ({ userId }) => {
    const user = database.users[userId];
    if (!user) {
      // 工具「失败」不抛异常，而是把可读提示当文本返回--模型看到会自己换 ID 重试
      return { content: [{ type: "text", text: `用户 ID ${userId} 不存在，可用 ID：001、002、003` }] };
    }
    return { content: [{ type: "text", text: `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}` }] };
  }
);
```

**Resource（静态）**：`docs://guide` 是固定 URI 的静态资源，由应用主动 `resources/read` 读取。回调返回 `{ contents: [{ uri, mimeType, text }] }`。

```ts
server.registerResource(
  "guide", "docs://guide",
  { description: "MCP Server 使用指南", mimeType: "text/plain" },
  async () => ({ contents: [{ uri: "docs://guide", mimeType: "text/plain", text: `MCP Server 使用指南\n功能：...` }] })
);
```

**Resource（模板）**：`user://{userId}` 是参数化资源（`ResourceTemplate`），按 URI 模板读取。和 `query_user` 返回的是同一份数据，但语义是「读上下文」而非「执行动作」（第 8 节细讲）。

```ts
server.registerResource(
  "user", new ResourceTemplate("user://{userId}", { list: undefined }),
  { description: "按 ID 读取单个用户信息（资源模板）", mimeType: "text/plain" },
  async (uri, { userId }) => { /* 返回单个用户的 contents */ }
);
```

**Prompt**：预置提示词模板，`argsSchema` 同样是 zod 字段对象。返回 `{ messages: [{ role, content: { type, text } }] }`。

```ts
server.registerPrompt(
  "summarize_user",
  { description: "生成一条「请总结某用户」的提示消息", argsSchema: { userId: z.string() } },
  async ({ userId }) => {
    const user = database.users[String(userId)];
    const text = user ? `请用一句话总结这个用户：${user.name}（${user.role}，邮箱 ${user.email}）。` : `用户 ${userId} 不存在`;
    return { messages: [{ role: "user", content: { type: "text", text } }] };
  }
);
```

**启动**：接上 stdio 传输。注意最后一行用 `console.error`。

```ts
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] user-info-server 已在 stdio 上就绪"); // ⚠️ 不能 console.log
```

### 跑一下：直接喂 JSON-RPC 验证

MCP Server 不需要等 Client 才能测--它就是个读 stdin、写 stdout 的程序。手动往 stdin 喂一串换行分隔的 JSON-RPC 消息，就能看到响应：

```bash
bun run mcp-server.ts <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_user","arguments":{"userId":"002"}}}
EOF
```

实测 `tools/list` 返回（SDK 自动把 zod 转成了 JSON Schema）：

```jsonc
{"result":{"tools":[{"name":"query_user",
  "description":"查询数据库中的用户信息……",
  "inputSchema":{"type":"object","properties":{"userId":{"type":"string","description":"用户 ID，例如 001、002、003"}},"required":["userId"]}}]},"id":2}
```

`tools/call query_user 002` 返回：

```jsonc
{"result":{"content":[{"type":"text","text":"用户信息：\n- ID: 002\n- 姓名: 李四\n- 邮箱: lisi@example.com\n- 角色: user"}]},"id":3}
```

传一个不存在的 `userId=999`，工具不抛异常，而是返回可读提示（模型看到会自己换 ID 重试）：

```jsonc
{"result":{"content":[{"type":"text","text":"用户 ID 999 不存在，可用 ID：001、002、003"}]},"id":4}
```

`resources/list`、`resources/templates/list`、`prompts/list`、`resources/read docs://guide`、`prompts/get summarize_user` 也都能正确响应。**一个 server，三原语全跑通。**

> 官方还提供一个图形化调试工具 **MCP Inspector**（`npx @modelcontextprotocol/inspector bun run mcp-server.ts`），能可视化地点 list / call，比手敲 JSON 省事，排查问题首选。

---

## 6. 接入 Cursor / Claude Desktop

Server 写好后，接入桌面 host 只需改一个配置文件，告诉 host「有这么个 server，用这个命令拉起它」。配置结构和 server 的 stdio 启动方式一一对应：

```jsonc
// Cursor：项目根目录 .cursor/mcp.json，或全局设置
// Claude Desktop：~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "user-info-server": {
      "command": "bun",
      "args": ["run", "/绝对/路径/到/03-mcp/mcp-server.ts"]
    }
  }
}
```

几个要点：

- **路径必须绝对**，相对路径会找不到。
- `command` 要能在 host 的环境里找到（`bun` 不在 PATH 就写绝对路径 `/Users/.../.bun/bin/bun`）。
- 改完配置要**彻底重启** host（Cursor / Claude Desktop 只关窗口不算退出，要 Cmd+Q / 托盘退出），否则新配置不生效。
- Cursor 里每个 MCP 工具有个启用/禁用开关，**点一下禁用再点一下启用**，且状态颜色区分不明显--工具没反应时先确认是不是被自己不小心关了（参考教程专门提了这个坑）。

这就是 MCP 的核心红利：**Server 写一次，插拔到任何 MCP host 当工具用**。Cursor、Claude Desktop、VS Code、自己的 LangChain Agent，用的是同一份 `mcp-server.ts`。

---

## 7. 接入 LangChain（`@langchain/mcp-adapters`）

桌面 host 之外，自己的代码也能当 MCP Client。LangChain 生态有 `@langchain/mcp-adapters`，把 MCP 工具适配成普通的 `DynamicStructuredTool`--**接到 02 的 Agent 循环里，循环代码一行不用改**。

### 装包

```bash
bun add @langchain/mcp-adapters
```

### Client 代码（`mcp-client.ts`）

配置和 Cursor 的 `mcpServers` 写法**完全一样**（stdio = 拉子进程 + stdin/stdout）。`getTools()` 底层自动 `initialize` + `tools/list`，返回工具数组：

```ts
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import path from "node:path";

const serverPath = path.join(import.meta.dir, "mcp-server.ts"); // 绝对路径，换机器不用改
const mcpClient = new MultiServerMCPClient({
  mcpServers: { "user-info-server": { command: "bun", args: ["run", serverPath] } },
});

const tools = await mcpClient.getTools();        // 跨进程拉来的工具，拍平成数组
const modelWithTools = model.bindTools(tools);   // 和 02 一样绑定
```

拿到 `tools` 之后，**Agent 循环和 02-mini-cursor 一模一样**：`invoke` → 检测 `tool_calls` → `foundTool.invoke(args)` → 包成 `ToolMessage` 回传 → 继续。对 Agent 来说，工具背后是另一个进程这件事完全透明：

```ts
// 和 02 完全相同的循环，唯一区别：tools 来自 MCP 而非本进程函数
for (const toolCall of response.tool_calls) {
  const found = tools.find((t) => t.name === toolCall.name);
  if (found) {
    const result = await found.invoke(toolCall.args);  // 背后是一次跨进程的 tools/call
    messages.push(new ToolMessage({ content: result, tool_call_id: toolCall.id ?? "" }));
  }
}
```

### 三个演示（均已实测跑通）

**演示 1：模型自动调用 MCP 工具**，问「查一下用户 002 的信息」，模型识别到要调 `query_user`，自动解析出 `userId=002`，跨进程调用，拿到「李四」的信息后用表格作答。全程和 02 调本地工具的体验一致。

**演示 2：读取 MCP Resource 注入上下文**，Resource 不会模型自动触发，要应用主动读。这里 `listResources()` + `readResource()` 读出 `docs://guide` 的内容，塞进 system message，再问「使用指南是什么」，模型据注入的资源作答：

```ts
const resourcesByServer = await mcpClient.listResources();   // { "user-info-server": [ {uri, name, ...} ] }
for (const [serverName, resources] of Object.entries(resourcesByServer)) {
  for (const resource of resources) {
    const contents = await mcpClient.readResource(serverName, resource.uri);
    resourceText += contents.map((c) => c.text).join("\n");
  }
}
const messages = [new SystemMessage(resourceText), new HumanMessage(query)]; // 注入 system message
```

**演示 3：读取 MCP Prompt**，`mcp-adapters` 没给 prompt 便捷方法，要用 `getClient()` 拿原始 MCP Client 再调 `getPrompt()`（这也说明 prompt 本就不在自动 Agent 循环里，是用户显式触发的）：

```ts
const rawClient = await mcpClient.getClient("user-info-server");
const { messages } = await rawClient.getPrompt({ name: "summarize_user", arguments: { userId: "002" } });
// messages: [{ role: "user", content: { type: "text", text: "请用一句话总结这个用户：李四……" } }]
```

### ⚠️ 收尾：必须 `close()`

```ts
await mcpClient.close();
```

这是 stdio 传输的通病：**MCP Server 是作为子进程被拉起的，你不主动关掉它，整个 Node 进程就不会退出**（子进程还活着，父进程挂着）。02 的 Agent 跑完自然退出，这里不行--养成最后 `mcpClient.close()` 的习惯。

---

## 8. Tool vs Resource：同一份数据，两种暴露方式

本课的 `query_user` 工具和 `user://{userId}` 资源模板返回的是**同一份用户数据**，这不是重复，而是为了讲清三原语里最容易混的两个：

| | `query_user`（Tool） | `user://{userId}`（Resource） |
|---|---|---|
| 协议方法 | `tools/call` | `resources/read` |
| 谁触发 | **模型**自主决定 | **应用**主动读取 |
| 语义 | 执行一个动作（action） | 读取一段上下文（read） |
| 典型去向 | ToolMessage 回进对话 | system message / 检索增强 |
| 适合 | 有副作用、要审批的操作 | 纯数据、文档、schema |

何时用 Tool：模型根据上下文判断「现在该做这件事了」（查、改、发、建）。何时用 Resource：应用想在对话前/中提供背景知识（说明书、DB schema、历史记录），模型不会主动去读。

> 经验法则：**有副作用或要决策 → Tool；纯只读上下文 → Resource；固定工作流模板 → Prompt**。

---

## 9. 常见坑（踩过的都在这）

| 坑 | 现象 | 解法 |
|---|---|---|
| **stdio server 用 `console.log`** | Client 连不上或解析乱掉 | stdout 是协议通道，打日志只能 `console.error`（stderr） |
| **不调 `close()`** | Client 进程跑完不退出 | stdio 拉的子进程要手动关：`await mcpClient.close()` |
| **Cursor 工具没反应** | 模型不调工具 | 检查工具是否被禁用（开关颜色不明显），点启用 |
| **配置里用相对路径** | host 找不到 server | `args` 里一律用绝对路径 |
| **远程 HTTP server 不鉴权** | 被 DNS rebinding 攻击 | 校验 Origin、绑 localhost、上 OAuth |
| **信了不可信的 tool annotations** | 被恶意 server 误导 | annotations 不可信，除非 server 来自可信来源 |
| **手写 JSON-RPC 消息内带换行** | stdio 消息解析错 | stdio 消息按换行分隔，单条消息内不能有换行 |

---

## 10. 何时该用 / 不该用 MCP

**该用**：
- 要**跨语言**复用已有工具（Python/Java/Rust 写的，不想重写）。
- 要让**多个 host**（Cursor + Claude Desktop + 自己的 Agent）共用同一套工具。
- 想直接用**别人写好的现成 server**（filesystem、GitHub、Sentry、Slack、数据库……生态很大）。

**不该用**：
- 单进程、单语言、只给自己的 Agent 用--前两课那样直接写函数更简单，还省了进程通信和协议开销。MCP 的价值在「跨进程/跨应用复用」，没有这个需求就是过度设计。

> MCP 不是替代前两课的 tool，而是给 tool 加了一条「能跨进程标准化暴露」的出路。**本地能搞定就本地搞，要跨出去才上 MCP。**

---

## 11. 运行

```bash
# 配好 .env（从 .env.example 复制，填 API_KEY / BASE_URL / MODEL_NAME）后
bun install          # 首次
bun explainer/examples/mcp-server.ts   # 单独跑 AI 示例 server
bun explainer/examples/mcp-client.ts   # 运行 AI 完整示例
```

`mcp-client.ts` 跑完会自动 `close()` 退出。`mcp-server.ts` 单独跑会一直等 stdin 输入（等 Client 连），按 Ctrl+C 退出。

建议按这个顺序学习：

1. 阅读原文，在 `solution/` 跟着实操。
2. 不看示例，完成 `problem/` 下的独立题目并运行测试。
3. 卡住时先回来看本文，最后才对照 `explainer/examples/`。

---

## 12. 进一步阅读

| 资料 | 价值 | 适合谁 |
|---|---|---|
| [官方 Architecture](https://modelcontextprotocol.io/docs/learn/architecture) | 两层架构 + 完整 JSON-RPC 握手时序，本文第 2、3 节的事实来源 | **想深入协议细节的首选起点** |
| [官方 Build a server](https://modelcontextprotocol.io/docs/develop/build-server) | 多语言 quickstart，本文 TS 代码的对照原型 | 要动手写 server 的人 |
| [官方 Tools / Resources / Prompts 概念页](https://modelcontextprotocol.io/docs/concepts/tools) | 三原语的字段、消息、错误码完整定义 | 要精确实现某个原语时查 |
| [官方 Transports](https://modelcontextprotocol.io/docs/concepts/transports) | stdio / Streamable HTTP 的完整规范（SSE、会话、重连） | 要写远程 HTTP server 时 |
| [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) | 官方图形化调试工具 | 排查任何 server 问题 |

> 下一节用现成的高德 MCP + 浏览器 MCP，体验「不写 server、直接复用别人生态」有多爽。
