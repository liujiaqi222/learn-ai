# 02：等待命令结束并拿到真实结果

实现 `execCommand(command, cwd)`，返回：

```ts
type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};
```

要求：

- 在指定 `cwd` 运行完整 shell 命令，保留引号和管道语义。
- 分别收集 stdout 与 stderr，等输出完整后再返回；正确保留 UTF-8 文本。
- 非零退出码表示命令运行后失败，仍返回上述结构。
- 进程无法启动时 reject，例如工作目录不存在。
- 不调用 `process.exit()` 结束父进程，不使用真实模型或网络服务。

可以使用 `spawn`，重点判断“何时完成”和“输出在哪里”。测试只检查行为，不限定事件监听的写法。

```bash
bun test problem/02-exec-command
```

思考：用 `shell: true` 时，命令不存在通常由谁返回错误？它和 shell 自身无法启动有什么不同？
