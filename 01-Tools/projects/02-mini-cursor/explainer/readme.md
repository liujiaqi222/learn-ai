# 从「只读」到「可执行」:给 Agent 装上能跑命令的手 -- mini-cursor

第一课给模型挂了一个 `read_file`,它只能「看」;本课给它加上了写文件、列目录、**执行命令**的能力。从此模型从「会读的聊天助手」变成「能自己建项目、写代码、装依赖、起服务」的准 Agent--本课结尾它真的全自动跑出了一个带样式和动画的 React TodoList 应用。

> 本文沿袭第一课的风格:不逐行翻译代码,重点讲**为什么这么写**、**相比第一课跨越了什么**、以及**这条路走到哪还差得远**。

---

## 1. 相比第一课跨越了什么:tool 的威力 = 操纵能力

第一课的结论是「模型是大脑,工具是手脚和眼睛」。但当时只有 `read_file` 一只「眼」,模型能看不能动。本课补齐了「手」:

| 工具 | 第一课 | 本课 | 给模型的能力 |
|---|---|---|---|
| `read_file` | ✅ | ✅ | 看 |
| `write_file` | ❌ | ✅ | 改 |
| `list_directory` | ❌ | ✅ | 探路 |
| `exec_command` | ❌ | ✅ | **执行**(spawn) |

`exec_command` 是质变。有了它,模型能跑 `npm create vite`、`npm install`、`npm run dev`--**任意终端命令**都成了它的手指。这就是 mini-cursor「能自动交付一个完整 app」的根基:不是模型变聪明了,是它终于有了能落地执行的「手」。

> 一句话:本课没换模型、没换循环,只是**把工具从「只读」扩到「可执行」**,Agent 的产出就从「解释一段代码」跃迁到「交付一个跑起来的 app」。**tool 的重要性就在这里--决定 Agent 能做到什么,远比调模型参数重要。**

---

## 2. 本课做了什么:让 AI 全自动造一个 Todo App

`mini-cursor.ts` 里塞了一条很长的任务 prompt,大意是:

1. `npm create vite react-todo-app --template react-ts` 建项目
2. 改写 `src/App.tsx`,实现完整 TodoList(增删改、筛选、统计、localStorage 持久化)
3. 加样式(渐变背景、卡片阴影、悬停效果)
4. 加动画(CSS transitions)
5. `npm install` + `npm run dev` 启起来

Agent 就自己一轮一轮地调工具:跑命令建项目 -> `list_directory` 看结构 -> `write_file` 写 App.tsx -> 再跑 install / dev。**全程无人干预**,最后真的起了一个能用的 Todo 应用。

这就是「mini-cursor」名字的由来--一个极简版的 Cursor:模型 + 一组文件/命令工具 + 一个循环。

---

## 3. 心智模型:Agent = 模型 + 工具 + 循环(复用第一课)

第一课讲透的「对话 = append-only 消息数组 + 工具调用循环」本课完全沿用,不再重复。只点本课相对第一课的**两点演进**:

- **循环封进函数 + `maxIterations=30`**:第一课是裸 `while` 循环(有无限跑的风险),本课改成 `for` 上限 30 轮,兜底防失控。这是从「演示」走向「可用」的最小改进。
- **每轮 `AIMessage` 都进日志**:循环内每次 `invoke` 后都 `messages.push(response)`,保证 `ToolMessage` 能靠 `tool_call_id` 关联回对应的 `AIMessage`(消息顺序的正确写法,第一课讲过)。本课要连续调几十次工具,这条是底线。

---

## 4. 本课新主角:spawn(exec_command 的底层)

`exec_command` 底层用 Node `child_process.spawn` 起子进程。spawn 是**事件驱动**的,和 `await` 天然不兼容,这是本课最不直观的部分,精炼记几个要点:

- **事件驱动 → Promise 桥接**:spawn 返回 `child` 对象,结果靠 `.on('close')/.on('error')` 回调拿,没法直接 await。用 `new Promise` 把回调包起来,在 `close`/`error` 里 `resolve`,工具才能 `await` 到真实结果回传给 Agent。
- **`stdio: 'pipe'` 必须手动消费流**:pipe 模式下 stdout/stderr 是可读流,不消费的话**缓冲区(~64KB)写满子进程就永久阻塞**、永远不退出。代码里边攒边 `console.log` 实时输出,攒够的 `out` 回传给 Agent 反思。(对比 `exec.ts` 教学版用 `stdio: 'inherit'` 直接接管到终端,就不用手动 `.on('data')`--但那样拿不到内容回传给模型,所以工具版只能用 pipe。)
- **`close` 而非 `exit`**:`exit` 触发时进程退了但流里可能还有数据没读完,会丢尾部输出;`close` 等流全部关闭后才触发,能保证 `out` 攒全。
- **`error` 和 `close` 都 resolve 是安全的**:Promise 的 resolve 幂等,多次调用只生效第一次。所以子进程启动失败(`error`)和结束(`close`)都 resolve 不会出问题。
- **整条命令字符串交给 `shell: true`,不要 split 成 args**:shell:true 下若拆 args,Node 会给每个参数加引号转义,把 `|`、`&&`、引号当字面字符,复杂命令会坏。整条字符串给 shell 让它自己解析。

> spawn 的完整心智模型图(子进程对象 + 3 个流 + 2 个事件)在 `solution/exec.ts` 文件头注释里画得很清楚,回顾时直接看那个文件;手写练习见 `practice/exec.ts`。

---

## 5. 代码精读:只讲「不那么显然」的部分

- **`write_file` 自动建父目录**:`fs.mkdir(path.dirname(filePath), { recursive: true })` 先把目录建出来再写文件,省得模型还得先调一次建目录的工具。一个小细节,少一轮工具往返。
- **错误当文本喂回模型**:4 个工具全部 `try/catch`,失败不抛异常中断流程,而是把错误信息当结果返回。模型看到「读取失败」会自己改路径重试。这是健壮 Agent 的通用做法(第一课已点过,本课一以贯之)。
- **`tool_call_id ?? ''`**:模型偶尔不给 id,用空串兜底防 undefined 崩掉。协议上 `ToolMessage` 的 `tool_call_id` 必填,这里是个防御性写法。
- **工具描述写中文 + system prompt 双保险**:SystemMessage 里用中文列了工具清单和当前工作目录。`description` 是模型选工具的唯一依据,这里干脆把工具列表也塞进 system prompt 双保险。
- **循环内串行执行工具**:本课用 `for` 串行跑每一轮的 tool_calls(第一课用 `Promise.all` 并发)。对自动造 app 这种有前后依赖的场景,串行更稳、日志也更易读。

---

## 6. ⚠️ 暴露的问题:离一个真正可用的 Agent 还差得远

mini-cursor 跑通 todo app 很爽,但也把短板暴露得很彻底:

| 问题 | 现状 | 差在哪 | 解决方向 |
|---|---|---|---|
| **可观测性差** | 全靠 `console.log`,Agent 在想什么、为什么调这个工具、哪步偏了,基本是黑盒 | 出问题时没法定位是模型决策错了还是工具执行错了 | **LangSmith / LangChain tracing**:把每一步的 input/output/tool_call 全量记录成可追溯的 trace;或在工具里加结构化日志 |
| **无断点重试** | 中途任何一步失败(比如某轮写文件写错了),整个流程基本废掉,得从头跑 | 几十轮工具调用的中间状态全在内存 `messages` 里,进程一死就没了 | **LangGraph 的 checkpoint / persistence**:把 `messages` 状态持久化,失败后能从某个检查点恢复重跑,而不是从零开始 |
| **无错误恢复 / 自纠偏** | 工具失败虽然会喂回模型,但模型不一定能纠对;跑歪了没人拦 | 缺乏「反思-回退」机制、缺乏人工介入点 | LangGraph 状态机 + **human-in-the-loop**:关键步骤暂停等人确认再继续 |
| **API 不熟** | spawn 的事件模型、LangChain 的消息/工具 API,还得边查边写 | 基础设施层不熟练,拖慢迭代 | 多默写(见 `practice/` 区),把 spawn/stdio、LangChain 消息协议这些底层吃透 |

> 一句话总结差距:**本课的 Agent 是「能跑通」的玩具,还谈不上「可靠」**。可靠需要:可观测(tracing)+ 可恢复(checkpoint)+ 可介入(human-in-the-loop)。这三样正是 LangGraph 要解决的事,所以下一课顺理成章。

---

## 7. 下一步学习路径

按顺序往下,每一步都能开一个新子项目:

1. **LangSmith / tracing**--先解决可观测性,看清 Agent 每一步在干嘛(本课最痛的点)
2. **LangGraph**--把 Agent 编排成显式状态机,引入 checkpoint(断点重试)和 human-in-the-loop(关键步暂停确认)
3. **Streaming**--`stream` / `streamEvents`,逐 token 输出 + 流式 tool_call,体验更好也能更早发现问题
4. **MCP**--接标准化的工具生态,工具跨应用复用
5. **更稳的工具设计**--路径沙箱、`invalid_tool_calls` 处理、工具结果截断防爆上下文(第一课点过的坑,本课同样没处理)

---

## 8. 运行

```bash
# 配好 .env(从 .env.example 复制,填 MODEL_NAME / API_KEY / BASE_URL)后
bun install      # 首次
bun solution/mini-cursor.ts
```

> ⚠️ `exec_command` 能跑**任意命令**,且没有沙箱。运行前看清 `solution/mini-cursor.ts` 里的任务 prompt,确认要在当前目录建 `react-todo-app` 再跑。
