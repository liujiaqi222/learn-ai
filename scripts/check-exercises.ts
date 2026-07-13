#!/usr/bin/env bun
/**
 * learn-ai 练习结构校验脚本（替代 ai-hero-cli internal lint）。
 * 扫描仓库里所有 projects/ 下的练习目录：
 *   - 已采用三件套（有 explainer/problem/solution 之一）的练习：校验完整性
 *   - 扁平老项目（没有任何变体文件夹）：跳过
 *
 * 规则：
 *   1. 每个存在的变体文件夹里 readme.md 必须非空
 *   2. problem/ 和 solution/ 必须各含至少一个非空 .ts 文件
 *   3. 不允许 .gitkeep
 *
 * 用法：在仓库根目录 `bun scripts/check-exercises.ts`
 */
import { readdirSync, readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const VARIANTS = ["explainer", "problem", "solution"] as const;

// 递归找所有名为 projects 的目录（跳过 node_modules / .git）
function findProjectsDirs(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.name === "projects") out.push(p);
    else findProjectsDirs(p, out);
  }
  return out;
}

const nonEmpty = (p: string) => {
  try { return readFileSync(p, "utf8").trim().length > 0; } catch { return false; }
};

// 文件夹里是否有至少一个非空 .ts 文件
function hasTs(folder: string): boolean {
  try {
    return readdirSync(folder).some(f => f.endsWith(".ts") && nonEmpty(join(folder, f)));
  } catch { return false; }
}

let totalErrors = 0;
const dirs = findProjectsDirs(root);

for (const pd of dirs) {
  const projects = readdirSync(pd, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => join(pd, d.name));

  for (const proj of projects) {
    const rel = relative(root, proj);
    const present = VARIANTS.filter(v => existsSync(join(proj, v)));
    if (present.length === 0) {
      console.log(`· ${rel}  (扁平项目，跳过)`);
      continue;
    }

    const errs: string[] = [];
    if (existsSync(join(proj, ".gitkeep"))) errs.push("不允许 .gitkeep");

    for (const v of present) {
      if (!nonEmpty(join(proj, v, "readme.md")))
        errs.push(`${v}/readme.md 缺失或为空`);
      if ((v === "problem" || v === "solution") && !hasTs(join(proj, v)))
        errs.push(`${v}/ 缺少非空 .ts 文件`);
    }

    if (errs.length) {
      totalErrors += errs.length;
      console.log(`✗ ${rel}`);
      errs.forEach(e => console.log(`    ${e}`));
    } else {
      console.log(`✓ ${rel}`);
    }
  }
}

if (dirs.length === 0) console.log("⚠️  没找到任何 projects/ 目录");

if (totalErrors) {
  console.log(`\n${totalErrors} 个问题`);
  process.exit(1);
}
console.log("\n全部通过 ✓");
