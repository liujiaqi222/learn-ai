import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execCommand } from "./index";

let workspace: string;
beforeEach(async () => { workspace = await fs.mkdtemp(path.join(os.tmpdir(), "exec-test-")); });
afterEach(async () => { await fs.rm(workspace, { recursive: true, force: true }); });
const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const script = (code: string) => `${quote(process.execPath)} -e ${quote(code)}`;

test("等待命令结束，完整返回 stdout 和 stderr", async () => {
  const result = await execCommand(script('process.stdout.write("开头"); process.stderr.write("提示"); setTimeout(() => process.stdout.write("结尾"), 20)'), workspace);
  expect(result).toEqual({ stdout: "开头结尾", stderr: "提示", exitCode: 0, signal: null });
});

test("非零退出码仍返回结果，保留诊断信息", async () => {
  const result = await execCommand(script('process.stderr.write("编译失败"); process.exit(7)'), workspace);
  expect(result.exitCode).toBe(7);
  expect(result.stderr).toBe("编译失败");
});

test("尊重 cwd，并保留 shell 引号与管道语义", async () => {
  const result = await execCommand(`${script('process.stdout.write(process.cwd())')} | cat`, workspace);
  expect(result.exitCode).toBe(0);
  expect(await fs.realpath(result.stdout)).toBe(await fs.realpath(workspace));
  const spaced = await execCommand(script('process.stdout.write("hello world")'), workspace);
  expect(spaced.stdout).toBe("hello world");
});

test("工作目录不存在导致启动失败时 reject", async () => {
  await expect(execCommand(script('console.log("never")'), path.join(workspace, "missing"))).rejects.toThrow();
});
