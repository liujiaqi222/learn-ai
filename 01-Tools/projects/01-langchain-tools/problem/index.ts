import { ChatOpenAI } from "@langchain/openai"
import { tool } from '@langchain/core/tools'
import { BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages"
import fs from 'node:fs/promises'
import { z } from 'zod'

// 练习：手写工具调用循环（ReAct）
// model / read_file 工具 / 初始消息都已给好，你只需实现下面的循环。
// 目标：模型决定调 read_file -> 你执行工具 -> 把结果包成 ToolMessage 回填 -> 再 invoke，
//       直到模型不再调工具。
// 参考：../solution/index.ts，讲解见 ../explainer/readme.md

const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.API_KEY,
    configuration: { baseURL: process.env.BASE_URL }
})

const readFileTool = tool(async ({ filePath }: { filePath: string }) => {
    const content = await fs.readFile(filePath, 'utf8')
    return `文件内容：${content}`
}, {
    name: 'read_file',
    description: '读取文件内容。输入文件路径（相对或绝对）。',
    schema: z.object({ filePath: z.string().describe('文件路径') })
})

const tools = [readFileTool]
const modelWithTools = model.bindTools(tools)

const messages: BaseMessage[] = [
    new SystemMessage('你是一个代码助手，可以用 read_file 工具读取文件并解释代码。'),
    new HumanMessage('请读取 ./solution/index.ts 文件内容并解释代码')
]

let response = await modelWithTools.invoke(messages)
messages.push(response)

// TODO: 实现工具调用循环
// 提示：
//   1. while (response.tool_calls && response.tool_calls.length)
//   2. 用 Promise.all 并发执行所有 tool_calls：tools.find(t => t.name === toolCall.name)，再 tool.invoke(toolCall.args)
//   3. 把每个结果包成 new ToolMessage({ content, tool_call_id: toolCall.id ?? '' }) push 进 messages
//   4. response = await modelWithTools.invoke(messages); messages.push(response)
//   5. 循环结束后 console.log('最终结果：', response.content)

console.log('最终结果：', response.content)
