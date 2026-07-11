// spawn() 启动子进程 拿到child对象
// spawn(command, args, options) → child
import { spawn } from 'child_process'


const userInput = 'ls -la'

const [cmd,...args] = userInput.split(' ')

const child = spawn(cmd, args, {
  stdio: 'inherit', // 直接把子进程的输出接到当前终端
  shell: true,   // 通过 shell 执行，支持管道 |、通配符 * 等 shell 特性
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