# 01：用工具完成一次文件修改

实现 `createFileTools(rootDirectory)`，返回三个 LangChain 工具。相对路径以 `rootDirectory` 为基准，不依赖运行测试时的工作目录。

| 名称 | 输入 | 成功结果 |
|---|---|---|
| `read_file` | `{ filePath: string }` | UTF-8 文件原文 |
| `write_file` | `{ filePath: string, content: string }` | 写入完成的文本说明；实际内容必须落盘 |
| `list_directory` | `{ directoryPath: string }` | 目标目录直接条目的名称，以换行分隔 |

要求：写入时自动创建父目录，支持覆盖和空内容；读取不存在的文件、参数类型不符合 schema 时抛错。工具层不吞掉错误，之后可由执行器统一反馈给模型。

这里只练文件能力，不要求实现目录沙箱，也不需要完成命令工具。测试会创建并清理独立临时目录。

```bash
bun test problem/01-file-tools
```

验收：嵌套写入和读回一致、覆盖生效、目录读取准确、错误明确。
