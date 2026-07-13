---
name: scaffold-learning
description: 为 learn-ai 仓库批量搭建练习骨架：按学习计划创建 explainer/problem/solution 三件套目录、带 TODO 的起手架和 readme，跑结构校验后提交。Use when user wants to scaffold exercises / 铺练习 / 建学习章节 / 新建练习骨架 / 给某知识点搭脚手架, or says 搭建/生成/批量创建练习/章节.
---

# Scaffold Learning

为 `~/code/learn-ai` 批量搭建练习目录骨架，跑 `bun scripts/check-exercises.ts` 校验通过后 `git commit`。仓库用 **TypeScript + Bun**，`.ts` 直接 `bun` 跑，无需编译。

## 目录命名（沿用仓库现有约定）

- **主题（Topic）**：`XX-Topic/`，如 `01-Tools`、`02-RAG`，dash-case
- **练习（Exercise）**：`XX-Topic/projects/NN-exercise-name/`，如 `01-Tools/projects/04-mcp-tools`
- 主题号 = `XX`，练习号 = `NN`，名称一律 dash-case（小写 + 连字符）

## 练习三件套

每个练习目录下至少有一个子文件夹，三个变体含义：

| 子文件夹 | 作用 | 必含文件 |
|---------|------|---------|
| `explainer/` | 概念讲解 / 自己的笔记（无 TODO） | `readme.md`（非空） |
| `problem/` | 带 TODO 的起手架，自己填 | `readme.md` + 至少一个非空 `.ts` |
| `solution/` | 完成版 / 参考实现 | `readme.md` + 至少一个非空 `.ts` |

- stub 时三件套默认都建（除非计划特别说明）。
- `explainer/` 可以只有 readme；`problem/` 和 `solution/` 必须有 `.ts`。
- 单文件入口习惯叫 `index.ts`；多文件项目（如 server + client）保留各自有意义的名字。
- `package.json` / `tsconfig.json` / `.env` / `.env.example` / `node_modules/` 放在**练习根目录**，三件套共享，不重复装依赖。

## 环境变量

练习要调模型 / 用 API key 时，在练习根目录放 `.env.example`（字段参考现有项目：`MODEL_NAME` / `API_KEY` / `BASE_URL`）。Bun 自动加载同目录 `.env`，无需 dotenv。problem 若不需要调模型（纯算法/工具练习）可不放。

## 必填文件规则

- 每个变体文件夹的 `readme.md` **不能为空**（哪怕只有一行标题）
- `problem/` 和 `solution/` 各至少一个非空 `.ts`（stub 时写一行 `// TODO: ...` 也算非空）
- 不放 `.gitkeep`
- stub readme 模板：
  ```md
  # 练习标题

  一句话描述这个练习要练什么。
  ```

## 工作流

1. **解析计划** - 从用户给的学习计划抽出主题名、练习名、是否三件套
2. **建目录** - `mkdir -p` 每条路径
3. **写 stub** - 每个变体文件夹一个 `readme.md`；problem/solution 各放带 TODO 的 `.ts` 起手架；需要时在练习根目录放 `.env.example`
4. **装依赖** - 练习根目录若有 `package.json` 且新增了依赖，`bun install`
5. **跑校验** - `bun scripts/check-exercises.ts`，修到全部 ✓
6. **提交** - `git add` + `git commit`

## 校验脚本

`bun scripts/check-exercises.ts`（在仓库根目录跑）扫描所有 `*/projects/*/` 练习：

- **扁平老项目**（没有 explainer/problem/solution 任何一个）：跳过，打印 `·`
- **三件套练习**：检查
  - 每个存在的变体文件夹 `readme.md` 非空
  - `problem/` 和 `solution/` 各含至少一个非空 `.ts`
  - 没有 `.gitkeep`

这是**结构校验**，不跑代码。solution 是否真能跑通要单独 `bun solution/xxx.ts` 验证。

## 移动 / 重命名练习

改编号或挪位置时：

1. 用 `git mv`（不是 `mv`）保留历史——注意：未跟踪的文件用普通 `mv`
2. 改数字前缀维持顺序
3. 移完重跑校验

```bash
git mv 01-Tools/projects/04-mcp 01-Tools/projects/05-mcp
bun scripts/check-exercises.ts
```

## 示例：从计划 stub

给定计划：

```
Topic 02: RAG
- 02.01 基础检索（explainer + problem + solution）
- 02.02 向量检索
- 02.03 RAG 流程整合
```

建目录：

```bash
mkdir -p 02-RAG/projects/01-basic-retrieval/{explainer,problem,solution}
mkdir -p 02-RAG/projects/02-vector-retrieval/{explainer,problem,solution}
mkdir -p 02-RAG/projects/03-rag-pipeline/{explainer,problem,solution}
```

写 stub（每个变体一个 readme；problem/solution 各一个带 TODO 的 index.ts）：

```
02-RAG/projects/01-basic-retrieval/explainer/readme.md  -> "# 基础检索\n\n讲 BM25 / 关键词检索的原理。"
02-RAG/projects/01-basic-retrieval/problem/readme.md    -> "# 基础检索\n\n自己实现一个简单的关键词检索。"
02-RAG/projects/01-basic-retrieval/problem/index.ts     -> "// TODO: 实现关键词检索\n"
02-RAG/projects/01-basic-retrieval/solution/readme.md   -> "# 基础检索\n\n参考实现。"
02-RAG/projects/01-basic-retrieval/solution/index.ts    -> "// TODO: 完成版（先留占位）\n"
...（02、03 同理）
```

需要调模型时在练习根目录加 `.env.example`。最后 `bun scripts/check-exercises.ts` 全 ✓ 再提交。
