/** AI 参考代码：把子进程事件桥接成可 await 的命令结果。 */
import { spawn } from "node:child_process";

// 保留两条输出流和退出状态，调用方才能判断命令实际做了什么。
export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export function execCommand(command: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // 1. 启动子进程。spawn 立即返回 child，不会在这里等待命令完成。
    const child = spawn(command, {
      cwd,          // 子进程从哪个目录执行命令。
      shell: true,  // command 是完整命令字符串，交给 shell 解释。
      stdio: [
        "ignore",   // stdin：不向子进程提供键盘等交互输入。
        "pipe",     // stdout：把正常输出接到 child.stdout，供下面读取。
        "pipe",     // stderr：把诊断输出接到 child.stderr，供下面读取。
      ],
    });

    let stdout = "";
    let stderr = "";

    // 2. 收集标准输出 stdout，例如子进程的 console.log("hello")。
    // data 每次交出一块数据；可能只有一块，也可能陆续到达多块。
    // 默认收到 Buffer（二进制字节）；设置编码后，这条流收到的是字符串。
    // 一个汉字的 UTF-8 字节可能跨两个数据块；流会暂存不完整的字节，
    // 等下一块补齐后再解码，避免逐块直接 toString() 产生乱码。
    child.stdout.setEncoding("utf8");

    child.stdout.on("data", (text: string) => {
      stdout += text;
    });

    // 3. 收集标准错误 stderr，例如子进程的 console.error("warning")。
    // 它和 stdout 是两条独立的流，因此也要单独设置编码和监听 data。
    // stderr 也可能包含警告或进度，有输出不代表命令一定失败。
    child.stderr.setEncoding("utf8");

    child.stderr.on("data", (text: string) => {
      stderr += text;
    });

    // 4. 处理启动等操作异常，例如 cwd 不存在导致 shell 无法启动。
    // reject 会让调用方的 await 抛错，外层工具执行器再负责反馈给模型。
    child.on("error", (error) => {
      reject(error);
    });

    // 5. 进程结束且输出流已关闭后，才把完整结果交给调用方。
    // code 为 0 通常表示成功，非零表示命令失败；两种情况都保留输出。
    // 被信号终止时 exitCode 可能为 null，signal 会说明终止信号。
    child.on("close", (exitCode, signal) => {
      resolve({ stdout, stderr, exitCode, signal });
    });
  });
}
