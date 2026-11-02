/**
 * Electron 启动器。
 * 某些终端/IDE（例如本身是 Electron 应用的宿主）会导出 ELECTRON_RUN_AS_NODE=1，
 * 这会让 electron.exe 退化成纯 Node，require('electron') 拿不到 app。
 * 这里显式清掉该变量后再拉起主进程，保证本地能正常启动桌面窗口。
 */
const { spawn } = require('node:child_process')
const path = require('node:path')
const electronBinary = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronBinary, [path.join(__dirname, '..'), ...process.argv.slice(2)], {
  env,
  stdio: 'inherit'
})

child.on('close', code => process.exit(code ?? 0))
