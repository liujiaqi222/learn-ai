// spawn() 启动子进程，拿到 child 对象
// spawn(command, options) -> child
import { spawn } from 'child_process'


const userInput = 'ls -la'

// ★ 不 split，整条命令原样交给 shell：
//   shell:true 下若拆成 args，Node 会对每个参数引号转义，
//   把管道 |、引号、&& 等当成字面字符，复杂命令会坏掉。
//   整条字符串给 shell，shell 自己解析，管道/引号/通配符都能正常工作。
const child = spawn(userInput, {
  stdio: 'inherit',   // 子进程输出直接接到当前终端，无需手动 .on('data')
  shell: true,        // 通过 shell 执行，支持 |、* 等 shell 特性
  cwd: process.cwd(), // 在当前工作目录下执行
})



child.on('error', (err) => {
  console.error(`Failed to start child process: ${err}`)
})

child.on('close', (code) => {
  if (code === 0) {
    process.exit(0)
  } else {
    console.error(`Child process exited with code ${code}`)
    process.exit(code||1)
  }
})
