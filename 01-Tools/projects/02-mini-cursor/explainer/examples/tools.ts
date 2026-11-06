/** AI 参考代码：四个工具共享同一个路径基准。这个基准不是安全沙箱。 */
import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { execCommand } from "./exec-command";

export function createFileTools(rootDirectory: string) {
  // 读取后返回文件原文，模型才能知道磁盘上实际保存了什么。
  const readFile = tool(
    async ({ filePath }) => {
      const target = path.resolve(rootDirectory, filePath);
      return fs.readFile(target, "utf8");
    },
    {
      name: "read_file",
      description: "读取 UTF-8 文本文件，获取文件实际内容。",
      schema: z.object({
        filePath: z.string().describe("相对于工作区的文件路径"),
      }),
    },
  );

  // 先创建父目录，再写入完整文本；已有文件会被覆盖。
  const writeFile = tool(
    async ({ filePath, content }) => {
      const target = path.resolve(rootDirectory, filePath);

      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");

      return `已写入 ${filePath}`;
    },
    {
      name: "write_file",
      description: "写入完整文本，自动创建父目录；已有文件会被覆盖。",
      schema: z.object({
        filePath: z.string(),
        content: z.string(),
      }),
    },
  );

  // 只列出直接条目，帮助模型确认工作区结构。
  const listDirectory = tool(
    async ({ directoryPath }) => {
      const target = path.resolve(rootDirectory, directoryPath);
      const entries = await fs.readdir(target);

      return entries.sort().join("\n");
    },
    {
      name: "list_directory",
      description: "列出目录下的直接条目；directoryPath 为 . 表示工作区。",
      schema: z.object({
        directoryPath: z.string(),
      }),
    },
  );

  return [readFile, writeFile, listDirectory];
}

export function createTools(rootDirectory: string) {
  const execTool = tool(
    async ({ command, workingDirectory }) => {
      // 每次命令单独计算 cwd，不依赖上一次 shell 中执行过的 cd。
      const cwd = path.resolve(rootDirectory, workingDirectory ?? ".");
      const result = await execCommand(command, cwd);

      // 文本结果包含真实目录、输出和退出状态，而不只是“执行成功”。
      return JSON.stringify({ cwd, ...result });
    },
    {
      name: "exec_command",
      description: "在指定目录运行会结束的 shell 命令，返回 stdout、stderr、exitCode 和 signal。",
      schema: z.object({
        command: z.string(),
        workingDirectory: z.string().optional().describe("相对工作区的目录，默认为 ."),
      }),
    },
  );

  return [...createFileTools(rootDirectory), execTool];
}
