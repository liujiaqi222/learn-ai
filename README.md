# learn-ai

学习 AI 的实践项目，所有示例用 **TypeScript + Bun** 编写和运行。

> Bun 自带 TypeScript 支持，**无需**额外装 `ts-node` / `tsx`，`.ts` 文件直接跑、直接断点调试。

## 环境要求

- [Bun](https://bun.sh) 1.x

安装（macOS）：

```bash
curl -fsSL https://bun.sh/install | bash
```

## 运行

所有 `.ts` 文件都直接用 bun 执行，无需编译：

```bash
cd 01-Tools/projects/01-langchain-tools   # 进入某个子项目
bun install                                # 首次运行：安装依赖
bun index.ts                               # 运行
```

### 环境变量

每个子项目目录有自己的 `.env`（已在 `.gitignore` 中忽略），从同目录的 `.env.example` 复制：

```bash
cp .env.example .env
# 填入 MODEL_NAME / API_KEY / BASE_URL
```

Bun 会**自动加载**当前工作目录下的 `.env`，无需 `dotenv`。

> 注意：调试时配置里把工作目录（cwd）设成了 `${fileDirname}`（文件所在目录），所以无论调试哪个文件，都会加载它同目录的 `.env`。

## 调试（VSCode + Bun 扩展）

推荐用 VSCode，装上 **Bun for Visual Studio Code** 扩展（扩展 ID：`oven-sh.bun-vscode`）。

仓库已配好 `.vscode/launch.json` 和 `.vscode/settings.json`，三种断点调试方式任选其一：

### 方式一：按 F5（最常用）

1. 打开任意 `.ts` 文件
2. 在想停的行号左侧点一下，设红点断点
3. 按 `F5`，选 `Debug Bun (当前文件)` 配置

停住后：`F10` 单步、`F11` 步入、`F5` 继续，左侧面板看变量和调用栈。

### 方式二：CodeLens 点击

打开 `.ts` 文件，第一行上方会出现 `Run | Debug` 小字，点 `Debug` 即可（先设好断点，否则一闪而过）。

### 方式三：Debug Terminal

VSCode 终端右侧下拉选 `JavaScript Debug Terminal`，直接输入 `bun index.ts`，命中断点。适合临时调试、需要带额外参数的场景。

> 三种方式原理相同（都是 `bun --inspect-wait` + 调试器 attach），只是触发入口不同。

## 项目结构

```
learn-ai/
├── .vscode/                          # 调试配置（launch.json / settings.json）
├── 01-Tools/                         # 工具调用相关示例
│   └── projects/
│       └── 01-langchain-tools/       # LangChain 工具调用最小 Agent
│           ├── index.ts
│           ├── .env.example          # 环境变量模板（复制为 .env）
│           └── ReadMe.md             # 该示例的详细讲解
└── README.md                         # 本文件
```

每个子项目目录通常有自己的 `ReadMe.md`，讲解该示例的具体内容与原理。
