import { BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { readFileTool, writeFileTool, execTool, listDirectoryTool } from './tools'
import { ChatOpenAI } from '@langchain/openai';


const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.API_KEY,
    configuration: {
        baseURL: process.env.BASE_URL
    }
})

const tools: DynamicStructuredTool[] = [readFileTool, writeFileTool, execTool, listDirectoryTool]
// 绑定工具到模型
const modelWithTools = model.bindTools(tools)

// Agent 执行函数
async function runAgent(query: string, maxIterations = 30) {
    const messages: BaseMessage[] = [
        new SystemMessage(`你是一个项目管理助手，使用工具完成任务。
当前工作目录: ${process.cwd()}
工具：
1. read_file: 读取文件
2. write_file: 写入文件
3. exec_command: 执行命令（支持 workingDirectory 参数）
4. list_directory: 列出目录`),
        new HumanMessage(query)
    ];

     for (let i = 0; i < maxIterations; i++) {
        console.log(`⏳ 正在等待 AI 思考...`);
        
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

                // 检查是否有工具调用

        if (!response.tool_calls || response.tool_calls.length === 0) {
            console.log(`✅ AI 已完成任务。`);
            console.log(`AI 输出: ${response.text}`);
            return response.text;
        }

        console.log(`🔧 检测到 ${response.tool_calls.length} 个工具调用，正在执行...`);
        
        for(const toolCall of response.tool_calls) {
            const toolName = toolCall.name;
            const toolArgs = toolCall.args;

            console.log(`🛠️ 执行工具: ${toolName}，参数: ${JSON.stringify(toolArgs)}`);
    
                const foundTool = tools.find(t => t.name === toolName);
                if(foundTool) {
                    const toolResult = await foundTool.invoke(toolArgs as any);
                    console.log(`📝 工具 ${toolName} 执行结果: ${toolResult}`);
                    messages.push(new ToolMessage({
                        content: toolResult,
                        tool_call_id: toolCall.id ?? '',
                    }));
                }

    }}

    return messages[messages.length - 1].text;
    
}

try {
    runAgent(`1. 创建项目：echo -e "n\nn" | npm create vite react-todo-app --template react-ts
2. 修改 src/App.tsx，实现完整功能的 TodoList：
 - 添加、删除、编辑、标记完成
 - 分类筛选（全部/进行中/已完成）
 - 统计信息显示
 - localStorage 数据持久化
3. 添加复杂样式：
 - 渐变背景（蓝到紫）
 - 卡片阴影、圆角
 - 悬停效果
4. 添加动画：
 - 添加/删除时的过渡动画
 - 使用 CSS transitions
5. 列出目录确认

注意：使用 npm，功能要完整，样式要美观，要有动画效果

之后在 react-todo-app 项目中：
1. 使用 npm install 安装依赖
2. 使用 npm run dev 启动服务器`)

}catch (err) {
    console.error(`❌ 运行 Agent 时发生错误: ${err}`);
}