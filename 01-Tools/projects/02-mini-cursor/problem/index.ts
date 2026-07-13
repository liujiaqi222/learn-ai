import { spawn } from 'child_process'

/**
 * 练习：实现 exec_command 工具的核心--把 spawn 的事件驱动桥接成 Promise。
 *
 * 目标：调用 execCommand('ls -la') 能拿到完整 stdout 输出并返回。
 * 参考：../solution/tools.ts 里的 execTool；讲解见 ../explainer/readme.md 第 4 节。
 * （另一条练习路线：去 ../practice/ 凭记忆默写 exec.ts。）
 *
 * 要点：
 *   1. spawn(command, { stdio: 'pipe', shell: true })
 *   2. 用 new Promise 把回调包起来，在 close / error 里 resolve
 *   3. 必须消费 stdout / stderr（pipe 缓冲区写满会阻塞子进程）--边攒边存到 out
 *   4. 用 close 而非 exit（保证 out 攒全）
 */
async function execCommand(command: string, cwd: string = process.cwd()): Promise<string> {
    // TODO: 实现 spawn -> Promise 桥接
    // 提示：
    //   const child = spawn(command, { stdio: 'pipe', cwd, shell: true })
    //   let out = ''
    //   child.stdout.on('data', chunk => { out += chunk.toString() })
    //   child.stderr.on('data', chunk => { out += chunk.toString() })
    //   child.on('error', err => resolve(`执行失败: ${err.message}`))
    //   child.on('close', code => resolve(code === 0 ? out : `失败 code=${code}\n${out}`))
    return ''
}

// 自测：跑一条 ls -la，看到目录输出就说明你实现对了
const result = await execCommand('ls -la')
console.log('=== exec_command 结果 ===')
console.log(result)
