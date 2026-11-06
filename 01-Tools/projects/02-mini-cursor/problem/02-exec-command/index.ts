export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export async function execCommand(command: string, cwd: string): Promise<CommandResult> {
  // TODO：执行 shell 命令，等待进程和输出流结束，返回真实结果。
  // 启动失败应 reject；命令以非零退出码结束仍应返回结果。
  return { stdout: "", stderr: "", exitCode: null, signal: null };
}
