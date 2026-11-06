# 03：把工具调用变成对应的结果消息

实现 `executeToolCalls(calls, tools)`，按输入顺序调用匹配名称的工具，返回 `ToolMessage[]`。测试已提供独立工具，不需要实现前两题。

要求：

- 每条调用恰好对应一条结果，`tool_call_id` 等于该调用的 `id`。
- 必须等待前一条完成再执行下一条，支持“先写后读”。
- 未注册工具、参数校验错误或执行异常，转成包含原因的文本结果，`status` 为 `error`；后续调用继续处理。
- 缺少 `id` 时 reject，不能用空字符串或新 ID 代替关联。

`calls` 遵循 LangChain 的 `ToolCall` 类型；它的 `type` 字段可能省略，执行器需要正确处理这种输入。工具既可能返回相同名字的多次调用结果，也可能执行失败。

```bash
bun test problem/03-dispatch-tools
```

验收：名称分发正确、串行顺序正确、结果 ID 一一对应、错误可被观察。
