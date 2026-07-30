import { tool } from "@langchain/core/tools";
import z from "zod";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

// 1. 读取文件工具
const readFileTool = tool(
  async ({ filePath }: { filePath: string }) => {
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      console.log(
        `[工具调用]read_file(${filePath})成功读取${fileContent.length}字节`,
      );
      return `文件内容 ${fileContent}`;
    } catch (err) {
      console.log(`[工具调用]read_file(${filePath})读取失败: ${err}`);
      return `读取文件失败:${err}`;
    }
  },
  {
    name: "read_file",
    description: "读取文件内容",
    schema: z.object({
      filePath: z.string().describe("文件路径"),
    }),
  },
);

// 2. 写入文件工具
const writeFileTool = tool(
  async ({ filePath, content }: { filePath: string; content: string }) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      console.log(
        `[工具调用]write_file(${filePath})成功写入${content.length}字节`,
      );
      return `写入文件成功`;
    } catch (err) {
      console.log(`[工具调用]write_file(${filePath})写入失败: ${err}`);
      return `写入文件失败:${err}`;
    }
  },
  {
    name: "write_file",
    description: "写入文件内容",
    schema: z.object({
      filePath: z.string().describe("文件路径"),
      content: z.string().describe("写入内容"),
    }),
  },
);

// 3. 执行工具带输入
// spawn 是事件驱动的（.on('close')/.on('error')），没法直接 await；
// 用 new Promise 把事件回调桥接成 Promise，在 close/error 里 resolve，
// 这样 await 才会真正等到子进程结束，工具才能把真实结果返回给 Agent。
// （Promise 的 resolve 幂等，多次调用只生效一次，所以 error+close 都 resolve 也安全）
const execTool = tool(
  async ({
    command,
    workingDirectory,
  }: {
    command: string;
    workingDirectory: string;
  }) => {
    return new Promise<string>((resolve) => {
      const cwd = workingDirectory || process.cwd();

      const child = spawn(command, {
        stdio: "pipe", // pipe 模式：stdout/stderr 走可读流，需手动消费（默认即 pipe，写明强调）
        cwd,
        shell: true,
      });

      // ⚠️ 必须消费 stdout/stderr：pipe 缓冲区（约 64KB）写满后子进程会阻塞、永远不退出。
      // 这里边攒边实时打到终端：out 回传给 Agent 反思，console.log 保留 live 输出。
      let out = "";
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        out += text;
        console.log(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        out += text;
        console.error(text);
      });

      child.on("error", (err) => {
        console.log(
          `[工具调用]exec_command(${command},${cwd}) 执行报错, ${err.message}`,
        );
        resolve(`执行失败: exec_command(${command},${cwd}), ${err.message}`);
      });

      // 用 close 而非 exit：close 在 stdio 流全部读完关闭后才触发，能保证 out 攒全；
      // exit 触发时进程虽退了，但流里可能还有数据没消费，会丢尾部输出。
      child.on("close", (code) => {
        if (code === 0) {
          console.log(`[工具调用]exec_command(${command},${cwd}) 执行成功`);
          resolve(`执行成功: exec_command(${command},${cwd})\n${out}`);
        } else {
          console.log(
            `[工具调用]exec_command(${command},${cwd}) 执行失败, 退出码=${code}`,
          );
          resolve(
            `执行失败: exec_command(${command},${cwd}), 退出码: ${code}\n${out}`,
          );
        }
      });
    });
  },
  {
    name: "exec_command",
    description: "执行命令行工具",
    schema: z.object({
      command: z.string().describe("命令行指令"),
      workingDirectory: z.string().describe("工作目录"),
    }),
  },
);

// 4.列出目录内容
const listDirectoryTool = tool(
  async ({ directoryPath }: { directoryPath: string }) => {
    try {
      const files = await fs.readdir(directoryPath);
      console.log(
        `[工具调用] list_directory("${directoryPath}") - 找到 ${files.length} 个项目`,
      );
      return `目录内容: ${files.toString()}`;
    } catch (err) {
      console.log(
        `  [工具调用] list_directory("${directoryPath}") - 错误: ${err}`,
      );
      return `列出目录失败: ${err}`;
    }
  },

  {
    name: "list_directory",
    description: "列出指定目录下的所有文件和文件夹",
    schema: z.object({
      directoryPath: z.string().describe("目录路径"),
    }),
  },
);

export { readFileTool, writeFileTool, execTool, listDirectoryTool };
