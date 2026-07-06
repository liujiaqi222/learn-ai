import { ChatOpenAI } from "@langchain/openai"
import { tool } from '@langchain/core/tools'
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages"
import fs from 'node:fs/promises'
import { z } from 'zod'

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.API_KEY,
    configuration: {
        baseURL: process.env.BASE_URL
    }
})



const readFileTool = tool(async ({ filePath }: { filePath: string }) => {
    const content = await fs.readFile(filePath, 'utf8')
    console.log(`工具调用 filePath: ${filePath}, 内容大小 ${content.length}`);
    return `文件内容：${content}`
}, {
    name: 'read_file',
    description: '用此工具来读取文件内容。 当用户要求读取文件、查看代码、分析文件内容时，调用此工具。 输入文件路径，相当路径或者绝对路径',
    schema: z.object({
        filePath: z.string().describe('当用户要求读取文件件路径')
    })
})


const tools = [
    readFileTool
]

const modelWithTools = model.bindTools(tools)



const messages = [
    new SystemMessage(`
  你是一个代码助手，可以使用工具读取文件并解释代码

  工作流程：
  1、当用户要求读取文件， 立即调用 read_file 工具
  2、等待工具返回文件内容
  3、基于文件内容进行分析和解释

  可用工具：
  - read_file: 读取文件内容
`),
    new HumanMessage('请读取/Users/liujiaqi/code/learn-ai/01-Tools/projects/01-langchain-tools/index.ts 文件内容并解释代码')
]

let response = await modelWithTools.invoke(messages);

// 将 ai 返回的消息放在消息数组中
messages.push(response)

while (response.tool_calls && response.tool_calls.length) {
    console.log(`[检测到${response.tool_calls.length}个工具调用`)
   const toolResults = await Promise.all(
    response.tool_calls.map(async toolCall => {
        const tool = tools.find(t => t.name === toolCall.name)
        if (!tool) {
            return `错误： 找不到工具 ${toolCall.name}`
        }
        console.log(`执行工具： ${toolCall.name} (${JSON.stringify(toolCall.args)})`)
        try {
            const result = await tool.invoke(toolCall.args)
            return result
        } catch (err) {
            console.log(`错误 ${err.message} `)
            return `错误：执行工具 ${toolCall.name} 失败：${err.message}`
        }
    }))
    
    // 将工具结果作为 ToolMessage 放在消息数组中
    response.tool_calls.forEach((toolCall, index) => {
        messages.push(new ToolMessage({
            content: toolResults[index],
            tool_call_id : toolCall.id
        }))
    })

    // 再次调用模型，传入工具调用

    response = await modelWithTools.invoke(messages)

}


console.log('最终结果：', response.content)
