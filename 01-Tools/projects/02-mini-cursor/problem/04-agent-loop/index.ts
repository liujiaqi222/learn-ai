import type { AIMessage, BaseMessage, ToolCall, ToolMessage } from "@langchain/core/messages";


export async function runAgent(
  query: string,
  model: { invoke(messages: BaseMessage[]): Promise<AIMessage> },
  execute: (calls: ToolCall[]) => Promise<ToolMessage[]>,
  systemText = "使用工具完成任务，根据执行结果继续判断；如实说明失败。",
): Promise<BaseMessage[]> {
  // TODO：组织初始消息，用 while 推进多轮工具调用，返回包含最终回复的完整历史。
  // execute 已由调用方提供，不需要实现其他题目。详见 readme。
  return [];
}
