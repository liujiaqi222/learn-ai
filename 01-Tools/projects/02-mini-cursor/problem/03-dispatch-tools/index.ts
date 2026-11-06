import type { ToolCall, ToolMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";

export async function executeToolCalls(
  calls: ToolCall[],
  tools: DynamicStructuredTool[],
): Promise<ToolMessage[]> {
  // TODO：按顺序分发调用，每个结果关联原 id；把可关联的执行错误回填为文本。
  // 缺少 id 无法关联结果，应 reject。详见 readme。
  return [];
}
