import { spawn } from 'child_process'

/**
 * 这个文件演示：用 Node.js 执行一条终端命令（ls -la）
 * 也是迷你版 Cursor「执行命令」能力的核心写法
 *
 * ════════════════════════════════════════════════════════════
 *  spawn() 的核心模型：启动子进程 → 拿到 child 对象
 * ════════════════════════════════════════════════════════════
 *
 *      spawn(cmd, args, options)        ← 启动子进程，返回 ↓
 *
 *           ┌──────────────┐
 *           │  child 对象   │  ← 子进程对象
 *           └──────────────┘
 *            │      │      │
 *            ▼      ▼      ▼
 *         stdout  stderr  stdin      ← 3 个流
 *         (输出)  (报错)  (输入)        每个「流」本质上都是 EventEmitter
 *            │      │      │           → 用 .on('事件名', 回调) 来收数据
 *            ▼      ▼      ▼
 *       .on('data')   .on('data')  .write(...)
 *
 *   child 自身还直接挂两个事件：
 *     child.on('error', err)    ← 子进程「没启动起来」时触发
 *     child.on('close', code)   ← 子进程「跑完了」时触发（0=成功）
 *
 * ════════════════════════════════════════════════════════════
 *  核心三步：
 *    1. 准备命令和运行环境
 *    2. 用 spawn 启动子进程，拿到 child 对象
 *    3. 监听 child 的「报错」和「结束」事件
 * ════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────
// 1. 准备要执行的命令和运行环境
// ─────────────────────────────────────────────

//   ls  : 列出目录内容
//   -l  : 长格式（显示权限、大小、修改时间等详细信息）
//   -a  : 显示所有文件（包括 . 开头的隐藏文件）
const command = 'ls -la'

// 当前工作目录：你在哪个文件夹运行这个脚本，它就是哪个
const cwd = process.cwd()

// 把命令字符串拆成「命令 + 参数」两部分
// 'ls -la' -> cmd = 'ls'，args = ['-la']
const [cmd, ...args] = command.split(' ')

// ─────────────────────────────────────────────
// 2. 用 spawn 启动子进程，返回一个 child 对象
// ─────────────────────────────────────────────

const child = spawn(cmd, args, {
  cwd,              // 在哪个目录下执行
  stdio: 'inherit', // ★ 重点：'inherit' 会把 child 的 3 个流（stdout/stderr/stdin）
                    //   直接连到当前终端，输出自动显示，无需手动 .on('data')
  shell: true,      // 通过 shell 执行，支持管道 |、通配符 * 等 shell 特性
})

// child 对象上有 3 个流（都是 EventEmitter）：
//   child.stdout  → 正常输出     本例因 stdio:'inherit' 已自动接管，无需手动监听
//   child.stderr  → 报错输出     同上
//   child.stdin   → 向子进程输入  同上
//
// 👉 如果 stdio 用默认值（不带 'inherit'），就要这样手动拿输出：
//      child.stdout.on('data', data => console.log(data.toString()))
//      child.stderr.on('data', data => console.error(data.toString()))

// 用来记录子进程启动/运行过程中发生的错误信息
let errorMsg = ''

// ─────────────────────────────────────────────
// 3. 监听 child 的两个关键事件
// ─────────────────────────────────────────────

// ① error 事件：子进程「根本没启动起来」时触发
//    比如命令写错、系统找不到这个程序
child.on('error', (error) => {
  errorMsg = error.message
})

// ② close 事件：子进程「执行结束」时触发（无论成功还是失败）
//    code 是退出码：0 = 成功，非 0 = 出错
child.on('close', (code) => {
  if (code === 0) {
    process.exit(0)         // 成功，正常退出
  } else {
    if (errorMsg) {
      console.error(`错误: ${errorMsg}`)
    }
    process.exit(code || 1) // 失败，带上错误码退出
  }
})
