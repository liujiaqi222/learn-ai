import type { DynamicStructuredTool } from "@langchain/core/tools";

export function createFileTools(rootDirectory: string): DynamicStructuredTool[] {
  // TODO：返回 read_file、write_file、list_directory 三个 LangChain 工具。
  // 所有相对路径以 rootDirectory 为基准；具体输入与返回约定见 readme。
  return [];
}
