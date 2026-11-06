/** AI 参考代码：维护消息历史，使用 while 推进工具调用。 */
import {
  HumanMessage,
  SystemMessage,
  type AIMessage,
  type BaseMessage,
  type ToolCall,
  type ToolMessage,
} from "@langchain/core/messages";

export async function runAgent(
  query: string,
  model: { invoke(messages: BaseMessage[]): Promise<AIMessage> },
  execute: (calls: ToolCall[]) => Promise<ToolMessage[]>,
  systemText = "使用工具完成任务，根据执行结果继续判断；如实说明失败。",
): Promise<BaseMessage[]> {
  // 1. 先把行为说明和用户任务放进上下文。
  const messages: BaseMessage[] = [
    new SystemMessage(systemText),
    new HumanMessage(query),
  ];

  // 2. 第一次请求模型，并保存它提出的调用或回答。
  let response = await model.invoke(messages);
  messages.push(response);

  // 3. 只要模型还提出工具调用，就执行并把结果交回模型。
  while (response.tool_calls?.length) {
    if (response.invalid_tool_calls?.length) {
      throw new Error("无法解析的工具调用");
    }

    const toolResults = await execute(response.tool_calls);
    messages.push(...toolResults);

    // 每轮都先保存新的 AIMessage，下一轮的工具结果才能找到对应请求。
    response = await model.invoke(messages);
    messages.push(response);
  }

  // 无法解析的调用不能被当成“已经没有操作，正常完成”。
  if (response.invalid_tool_calls?.length) {
    throw new Error("无法解析的工具调用");
  }

  return messages;
}
