/** AI 参考代码：按请求顺序执行工具，并关联每条结果。 */
import { ToolMessage, type ToolCall } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";

export async function executeToolCalls(
  calls: ToolCall[],
  tools: DynamicStructuredTool[],
): Promise<ToolMessage[]> {
  const results: ToolMessage[] = [];

  // 一批调用中可能先写文件、再读取它，所以逐条等待，不并发执行。
  for (const call of calls) {
    if (!call.id) {
      throw new Error("工具调用缺少 id");
    }

    try {
      // 模型给出工具名，应用从已注册的工具里找到对应实现。
      const selected = tools.find((candidate) => candidate.name === call.name);

      if (!selected) {
        throw new Error(`未注册的工具：${call.name}`);
      }

      // 传完整调用对象，让 LangChain 校验参数并返回带原 id 的 ToolMessage。
      const result = await selected.invoke({ ...call, type: "tool_call" });
      results.push(result);
    } catch (error) {
      // 保留调用 id，把本次操作失败的原因交回模型，继续处理后续调用。
      const reason = error instanceof Error ? error.message : String(error);

      const errorMessage = new ToolMessage({
        name: call.name,
        tool_call_id: call.id,
        content: `工具执行失败：${reason}`,
        status: "error",
      });

      results.push(errorMessage);
    }
  }

  return results;
}
