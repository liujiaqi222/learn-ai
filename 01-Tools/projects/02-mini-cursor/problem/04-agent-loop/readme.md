# 04：让 Agent 依据反馈继续工作

实现 `runAgent(query, model, execute, systemText?)`，返回包含最终回复的完整消息数组。

`model.invoke(messages)` 返回下一条 `AIMessage`；`execute(calls)` 返回这一批调用的 `ToolMessage[]`。两者由测试提供，不依赖其他题目，不调用真实模型。

要求：

1. 初始历史包含 `SystemMessage` 和 `HumanMessage`，保留用户输入。
2. 每次模型响应先写入历史；只要仍有工具请求，用 `while` 执行、回填，再调用模型。
3. 下一次模型请求必须能看到前一轮调用和结果，连续两轮也不能遗漏。
4. 没有调用请求时停止，最终 `AIMessage` 也保留在返回历史中。
5. 发现 `invalid_tool_calls` 时明确报错，不当作正常完成。

本题不要求增加运行预算或恢复机制，先把消息顺序和停止条件写清楚。

```bash
bun test problem/04-agent-loop
```
