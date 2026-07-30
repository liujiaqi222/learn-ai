---
name: scaffold-learning
description: 为 learn-ai 仓库搭建学习练习：AI 生成系统讲解、完整示例、分知识点 TODO 与行为测试，但把 solution 保留给学习者亲手实操。Use when user wants to scaffold exercises / 铺练习 / 建学习章节 / 新建练习骨架 / 给某知识点搭脚手架, or says 搭建/生成/批量创建练习/章节.
---

# Scaffold Learning

为 `~/code/learn-ai` 创建以“阅读原文 → 亲手实操 → 独立测评 → 最后对照”为主线的学习目录。
仓库使用 **TypeScript + Bun**。

## 核心边界

三个目录按作者和用途划分：

| 目录 | 谁写 | 用途 |
|---|---|---|
| `explainer/` | AI | 系统讲解，以及 AI 生成的完整参考代码 |
| `solution/` | 学习者 | 跟着原始材料亲手完成的整体实操 |
| `problem/` | AI 出题，学习者作答 | 按独立能力拆分的 TODO 与预写测试 |

必须遵守：

- **禁止在 `solution/` 生成完整代码。**
- 新建时只为 `solution/` 写 `readme.md`，说明实操目标和建议文件名。
- 不覆盖、补全或重写学习者已有的 `solution/` 代码，除非用户明确要求修改。
- AI 完整实现只能放在 `explainer/examples/`，并标明“AI 参考代码”。
- `problem/` 的测试先于学习者实现存在；TODO 未完成时测试失败是正常状态。

## 目录结构

```text
XX-Topic/projects/NN-exercise-name/
├── explainer/
│   ├── readme.md
│   └── examples/
│       └── ...               # AI 完整示例
├── solution/
│   └── readme.md             # 学习者实操区，不放 AI 代码
├── problem/
│   ├── readme.md             # 题目索引
│   ├── 01-one-capability/
│   │   ├── readme.md
│   │   ├── index.ts          # TODO 起手架
│   │   └── index.test.ts     # 预写行为测试
│   └── 02-next-capability/
└── package.json
```

- Topic：`XX-Topic/`，例如 `01-Tools`。
- Exercise：`XX-Topic/projects/NN-exercise-name/`。
- 编号保持两位数；名称使用小写 dash-case。
- 共享的 `package.json`、`tsconfig.json`、`.env.example` 放在练习根目录。

## 如何拆 Problem

按“能独立证明已经掌握的能力”拆题，不按文章段落或单个 API 机械拆分。

好的题目：

- 能用一句话描述可观察结果。
- 不依赖前一道题，能单独运行。
- 一题只保留一个主要学习目标。
- 起手架只提供无关样板和必要数据，不泄露核心答案。

如果两个知识点只有组合后才有意义，可以合成一道集成题；不要为了数量制造碎题。

## 测试规则

每道题必须有测试，并在写 TODO 起手架时一起生成。

- 测**对外行为**，不要搜索源码或限定必须使用某种写法。
- 优先使用确定性的本地数据、fake、in-memory transport。
- 默认不调用真实模型、不消耗 API key、不访问不稳定的外部服务。
- 至少覆盖主路径和一个重要边界条件。
- 测试名称要直接表达能力，例如“能发现并调用 query_user”。
- 使用 `bun test problem/01-example` 单独运行。
- 测试本身必须能够加载；TODO 未完成时应因断言不满足而失败，而不是语法错误。

## Explainer 规则

`explainer/readme.md` 将原始材料中较散的知识重新组织成清晰的心智模型：

1. 先解释为什么需要它。
2. 再讲核心角色和数据流。
3. 然后解释关键 API 与常见坑。
4. 最后给运行方法和进一步阅读。

完整代码放进 `explainer/examples/`，不要把长实现全部塞进正文，也不要放进 `solution/`。

## Solution 规则

`solution/readme.md` 只写：

- 原始学习材料来源。
- 本次整体实操要完成什么。
- 建议创建哪些文件、如何运行。
- 明确“代码由学习者完成，AI 脚手架不会生成或覆盖”。

`solution/` 没有 `.ts` 文件是合法的，表示学习者尚未开始。

## 工作流

1. 读取学习计划、原始材料和相邻练习，提取真正需要掌握的能力。
2. 创建 `explainer/problem/solution` 和必要的共享配置。
3. 写系统化 explainer，并把 AI 完整代码放入 `explainer/examples/`。
4. 为每项独立能力生成 TODO 起手架和行为测试。
5. 只为 `solution/` 创建说明，保留实现空间。
6. 安装新增依赖。
7. 运行结构校验：

   ```bash
   bun .claude/skills/scaffold-learning/check-exercises.ts
   ```

8. 对 AI 示例运行类型检查或实际验证；对未完成 problem 说明预期失败的测试数量和原因。
9. 汇报改动，不自动 commit；只有用户明确要求时才提交。

## 迁移旧练习

如果旧练习把 AI 参考实现放在 `solution/`：

1. 用 `git mv` 移到 `explainer/examples/`，保留历史。
2. 修正代码内部路径和文档命令。
3. 把 `solution/readme.md` 改成学习者实操说明。
4. 将综合 TODO 拆成独立题目，并为每题补行为测试。
5. 不移动能够确认是学习者亲手写的代码；不确定时先询问。

结构校验兼容尚未迁移的扁平旧题，但新练习一律采用分题结构。
