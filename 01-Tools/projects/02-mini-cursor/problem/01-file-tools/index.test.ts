import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFileTools } from "./index";

let workspace: string;
beforeEach(async () => { workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-tools-test-")); });
afterEach(async () => { await fs.rm(workspace, { recursive: true, force: true }); });

function getTool(name: string) {
  const selected = createFileTools(workspace).find((candidate) => candidate.name === name);
  expect(selected).toBeDefined();
  return selected!;
}

test("能写入嵌套文件、读取内容，并覆盖已有文件", async () => {
  const write = getTool("write_file");
  const read = getTool("read_file");
  await write.invoke({ filePath: "nested/hello.ts", content: "你好 mini cursor" });
  expect(await fs.readFile(path.join(workspace, "nested/hello.ts"), "utf8")).toBe("你好 mini cursor");
  expect(await read.invoke({ filePath: "nested/hello.ts" })).toBe("你好 mini cursor");
  await write.invoke({ filePath: "nested/hello.ts", content: "" });
  expect(await read.invoke({ filePath: "nested/hello.ts" })).toBe("");
});

test("列出目标目录的直接条目，不混入其他目录", async () => {
  const list = getTool("list_directory");
  await fs.mkdir(path.join(workspace, "sub"));
  await fs.writeFile(path.join(workspace, "sub/inside.txt"), "inside");
  await fs.writeFile(path.join(workspace, "outside.txt"), "outside");
  expect((await list.invoke({ directoryPath: "sub" })).trim()).toBe("inside.txt");
});

test("缺少文件或参数类型错误时明确失败", async () => {
  const read = getTool("read_file");
  await expect(read.invoke({ filePath: "missing.txt" })).rejects.toThrow();
  await expect(read.invoke({ filePath: 123 })).rejects.toThrow();
});
