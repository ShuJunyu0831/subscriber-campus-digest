#!/usr/bin/env node
/**
 * Subscriber 全功能检验入口。
 *
 * 默认执行：
 *   1. TypeScript 类型检查 + Vite 生产构建
 *   2. Playwright 离线端到端与核心纯函数检验
 *
 * 可选：
 *   --desktop  额外执行已打包桌面版的 electron/verify-package.mjs
 *   --no-build 跳过构建（仅重复跑测试时使用）
 *
 * 真实厂商 API 与真实官网/RSS 不属于默认 CI：前者需要用户自己的 Key，
 * 后者受网络与站点结构影响。这里不会用 mock 冒充这两类真实调用已通过。
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(label, command, commandArgs, extraEnv = {}) {
  console.log(`\n[verify] ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CI: '1', ...extraEnv },
  })
  if (result.status !== 0) {
    console.error(`\n[verify] 失败：${label}（退出码 ${result.status ?? 'unknown'}）`)
    process.exit(result.status ?? 1)
  }
}

console.log('Subscriber 全功能检验')
console.log(`项目：${root}`)
console.log('范围：五视图、三条导入通道、分类/版本引擎、RSS/Atom/公众号解析、编码、本机存储、模型路由（mock）')
console.log('边界：真实厂商 Key 与真实外网站点不在默认离线检验内，不会伪报通过。')

const required = ['src/App.tsx', 'src/classify.ts', 'src/shareImport.ts', 'src/dropImport.ts', 'electron/share-args.cjs']
for (const file of required) {
  if (!existsSync(join(root, file))) {
    console.error(`[verify] 缺少关键文件：${file}`)
    process.exit(1)
  }
}

if (!args.has('--no-build')) run('类型检查与生产构建', npm, ['run', 'build'])
run('功能与回归检验', npm, ['test', '--', '--reporter=line'])

if (args.has('--desktop')) {
  const candidates = [
    join(root, 'desktop-verify-dist-v2', 'Subscriber', 'Subscriber.exe'),
    join(root, 'desktop-verify-dist', 'Subscriber', 'Subscriber.exe'),
    join(root, 'desktop-dist', 'Subscriber', 'Subscriber.exe'),
  ]
    .filter(candidate => existsSync(candidate))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  const exe = candidates[0]
  if (!exe) {
    console.log('\n[verify] 跳过桌面打包检验：未找到 Subscriber.exe')
    console.log('         先运行 npm run desktop:portable，再执行 npm run verify -- --desktop')
  } else {
    // 独立 userData / 缓存：用户正开着 Subscriber 时，检验也不会抢单实例锁或 Chromium 缓存。
    const isolated = mkdtempSync(join(tmpdir(), 'subscriber-verify-'))
    mkdirSync(join(isolated, 'userdata'), { recursive: true })
    try {
      run('桌面打包端到端检验', process.execPath, ['electron/verify-package.mjs', exe], {
        APPDATA: isolated,
        LOCALAPPDATA: isolated,
        SUBSCRIBER_VERIFY_USER_DATA: join(isolated, 'userdata'),
      })
    } finally {
      rmSync(isolated, { recursive: true, force: true })
    }
  }
}

console.log('\n[verify] 通过：离线功能检验全部成功。')
console.log('[verify] 未自动验证：真实厂商请求（需 API Key）、真实官网/RSS 当前可达性（需外网）。')
