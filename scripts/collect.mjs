/**
 * P0 真实数据链路 —— 构建期快照采集
 *
 * 用 esbuild 把 src/liveSource.ts 打成单文件 ESM，在 Node 里真实抓取
 * 竞赛官网公告，交给分类引擎归一，写出 src/live/competitions.json。
 * Web 版与 Playwright 测试直接消费这份快照（浏览器受跨域限制不直连）。
 * 同时产出 electron/live/collector.cjs，供桌面版主进程实时抓取。
 *
 * 用法：npm run collect          （全失败时退出码 1）
 *       node scripts/collect.mjs --lenient   （构建链内使用：失败仅警告）
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const lenient = process.argv.includes('--lenient')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = resolve(root, '.tmp-collect/collector.mjs')
const electronBundlePath = resolve(root, 'electron/live/collector.cjs')

await mkdir(dirname(bundlePath), { recursive: true })
await build({
  entryPoints: [resolve(root, 'scripts/collect-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundlePath,
  logLevel: 'warning',
})

// 桌面版主进程用 CJS：Electron main 是 .cjs，require 不了 ESM
await mkdir(dirname(electronBundlePath), { recursive: true })
await build({
  entryPoints: [resolve(root, 'scripts/collect-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: electronBundlePath,
  logLevel: 'warning',
})

const { fetchLiveCompetitions } = await import(pathToFileURL(bundlePath).href)
const report = await fetchLiveCompetitions()

const outPath = resolve(root, 'src/live/competitions.json')
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`[collect] 抓取时间 ${report.fetchedAt}`)
for (const log of report.logs) {
  console.log(`[collect] ${log.ok ? '✓' : '✗'} ${log.source} — ${log.message}`)
}
console.log(`[collect] 共 ${report.items.length} 条真实条目 → ${outPath}`)
console.log(`[collect] 桌面版实时采集器 → ${electronBundlePath}`)

if (report.items.length === 0) {
  const hint = '没有抓到任何条目，请检查网络或官网页面结构'
  if (lenient) console.warn(`[collect] 警告：${hint}（继续构建，使用上次快照）`)
  else {
    console.error(`[collect] ${hint}`)
    process.exitCode = 1
  }
}
