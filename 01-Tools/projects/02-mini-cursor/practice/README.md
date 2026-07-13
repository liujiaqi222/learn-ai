# 手写练习区

这里放我「凭记忆手写」的练习代码，和 solution/ 的参考版对照学习。

## 约定

- **整文件默写**：和参考版同名，丢进这里 -> `exec.ts` -> `practice/exec.ts`
- **单概念练习**：用概念名，一个文件聚焦一个点 -> `practice/spawn-stdio.ts`
- 不加日期 / 编号，追溯时间用 git history

## 学习闭环

1. 合上参考版，凭记忆写
2. 写完 diff 对照参考版，看漏了啥、记错了啥
3. 漏掉 / 记错的点记到下面「练习记录」的易错点
4. 过几天再默写一次，看易错点是不是还在错

对照命令（在 `practice/` 目录下执行）：

```bash
diff ../solution/exec.ts exec.ts
# 或更直观（带颜色）：
git diff --no-index --color ../solution/exec.ts exec.ts
```

## 练习记录

### exec.ts -- spawn 执行命令

- 日期：2026-07-11
- 易错点：
  - stdio 默认要走手动 .on('data'),用 'inherit' 才能自动接管到终端
  - process.exit(code) 在子进程被信号杀死时(code=null)会静默退出 0,必须 code || 1


---

<!-- 新练习模板：复制下面这段开新条目

### <文件名> -- <一句话主题>

- 日期：
- 易错点：
  -

-->
