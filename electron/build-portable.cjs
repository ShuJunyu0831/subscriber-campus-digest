/**
 * 组装免安装版（portable）Windows 应用。
 *
 * 为什么不用 electron-builder 的 nsis/portable 目标：
 * 它把 Electron 解压到 win-unpacked.tmp 再重命名目录，在本机环境中
 * 大目录重命名会被文件系统钩子拦成 EPERM，随后 fallback 的递归删除
 * 又会触发 safe-delete 保护，导致打包中断。这里改用「复制 + asar」的
 * 覆盖式组装，全程不做批量删除，产物结构与 electron-builder 一致。
 *
 * 用法：node electron/build-portable.cjs [输出根目录]
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const asar = require('@electron/asar')

const root = path.join(__dirname, '..')
const outRoot = path.resolve(process.argv[2] || path.join(root, 'desktop-dist'))
const appDir = path.join(outRoot, 'Subscriber')
const stageDir = path.join(outRoot, '.stage')
const asarOut = path.join(outRoot, 'app.asar')
const asarTarget = path.join(appDir, 'resources', 'app.asar')
const exeTarget = path.join(appDir, 'Subscriber.exe')

const log = step => process.stdout.write(`• ${step}\n`)

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

/** 递归统计文件数量，用来校验 asar 里没有多余或遗漏的条目 */
function countFiles(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1
  }
  return total
}

async function main() {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    fail('缺少 dist/index.html，请先运行 npm run build')
  }

  // 1. 复制 Electron 运行时（覆盖式，不删除任何文件）
  log('复制 Electron 运行时')
  fs.mkdirSync(appDir, { recursive: true })
  fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), appDir, { recursive: true, force: true })

  // 2. 组装 asar 内容：package.json + electron/ + dist/
  // 每次都要清空 stage：vite 每次构建会换 hash 文件名，累积下来旧 bundle 会被打进包。
  log('组装应用目录')
  for (const stale of ['dist', 'electron']) {
    const stalePath = path.join(stageDir, stale)
    if (!fs.existsSync(stalePath)) continue
    try {
      fs.rmSync(stalePath, { recursive: true, force: true })
    } catch (error) {
      // 本机 safe-delete 钩子偶尔会让目录删除失败（trash-failed），
      // 删不掉就改名挪开，效果等价且不会中断打包。
      const parked = `${stalePath}.stale-${Date.now()}`
      try {
        fs.renameSync(stalePath, parked)
        log(`无法删除 ${stale}，已改名挪开：${path.basename(parked)}`)
      } catch (renameError) {
        fail(`无法清理 ${stalePath}：${error.message} / ${renameError.message}`)
      }
    }
  }
  fs.mkdirSync(path.join(stageDir, 'electron'), { recursive: true })
  fs.cpSync(path.join(root, 'dist'), path.join(stageDir, 'dist'), { recursive: true, force: true })
  for (const file of ['main.cjs', 'preload.cjs', 'share-args.cjs']) {
    fs.copyFileSync(path.join(root, 'electron', file), path.join(stageDir, 'electron', file))
  }
  // electron/live/collector.cjs 由 npm run collect 生成（esbuild 打包 src/liveSource.ts + src/rss.ts）。
  // 主进程的 live:fetch / rss:fetch 都依赖它；漏拷的后果是打包版一律报「采集器未打包」，
  // 而源码运行时又完全正常，很容易漏测，所以这里必须存在性判断 + 明确日志。
  const collectorFile = path.join(root, 'electron', 'live', 'collector.cjs')
  if (fs.existsSync(collectorFile)) {
    fs.mkdirSync(path.join(stageDir, 'electron', 'live'), { recursive: true })
    fs.copyFileSync(collectorFile, path.join(stageDir, 'electron', 'live', 'collector.cjs'))
    log('打包采集器 live/collector.cjs')
  } else {
    log('未找到 electron/live/collector.cjs，打包版将没有实时抓取（先跑 npm run collect）')
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const slimPackage = {
    name: 'subscriber',
    productName: 'Subscriber',
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    main: 'electron/main.cjs',
    private: true,
  }
  fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(slimPackage, null, 2))

  // 3. 打包 asar 并复制进运行时
  // createPackage 是异步的：不加 await 会复制到写了一半的文件，
  // 表现为产物大小每次都不一样（507/998/1488 KB）且偶尔直接损坏。
  log('生成 app.asar')
  await asar.createPackage(stageDir, asarOut)
  fs.mkdirSync(path.join(appDir, 'resources'), { recursive: true })
  fs.copyFileSync(asarOut, asarTarget)

  // 回读校验：曾出现过资源目录残留上一次构建的 app.asar，应用名和版本
  // 都是旧的却毫无报错，这里必须确认内容、大小、条目数三者一致。
  const copiedName = JSON.parse(asar.extractFile(asarTarget, 'package.json').toString()).name
  const sourceSize = fs.statSync(asarOut).size
  const targetSize = fs.statSync(asarTarget).size
  // listPackage 会把目录也列出来，所以逐个比对 stage 里的文件是否都在包里
  const packed = new Set(
    asar.listPackage(asarTarget).map(entry => entry.replace(/^[\\/]/, '').replace(/\\/g, '/'))
  )
  const missing = []
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative)
      else if (!packed.has(relative)) missing.push(relative)
    }
  }
  walk(stageDir, '')

  if (copiedName !== slimPackage.name || sourceSize !== targetSize || missing.length > 0) {
    fail(
      `asar 校验失败：name=${copiedName}，大小 ${sourceSize} → ${targetSize}，` +
        `缺失 ${missing.length} 个文件（${missing.slice(0, 3).join('、')}）`
    )
  }
  log(
    `asar 已就位（${(targetSize / 1024).toFixed(0)} KB，name=${copiedName}，` +
      `${countFiles(stageDir)} 个文件已全部打包）`
  )

  // 4. 主程序改名（单文件改名，不涉及目录重命名）
  const exeSource = path.join(appDir, 'electron.exe')
  if (fs.existsSync(exeSource)) {
    if (fs.existsSync(exeTarget)) {
      try {
        fs.rmSync(exeTarget, { force: true })
      } catch {
        fail('无法覆盖 Subscriber.exe，请先关闭正在运行的 Subscriber 再重试')
      }
    }
    fs.renameSync(exeSource, exeTarget)
    log('重命名主程序为 Subscriber.exe')
  } else if (fs.existsSync(exeTarget)) {
    log('主程序已是 Subscriber.exe')
  } else {
    fail('未找到 electron.exe，运行时复制可能失败')
  }

  // 5. 写入应用图标与版本信息（需要先有 build/icon.ico）
  if (fs.existsSync(path.join(root, 'build', 'icon.ico'))) {
    log('写入图标与版本信息')
    execFileSync(process.execPath, [path.join(__dirname, 'patch-exe.cjs'), exeTarget], { stdio: 'inherit' })
  }

  // 6. 写一个说明文件，避免用户找不到入口
  fs.writeFileSync(
    path.join(appDir, '使用说明.txt'),
    [
      'Subscriber 桌面版（免安装）',
      '',
      '1. 双击本目录下的 Subscriber.exe 即可运行，无需安装。',
      '2. 这是免安装版本，可以直接把整个文件夹复制到任意位置。',
      '3. 卸载：直接删除整个文件夹。用户数据位于 %APPDATA%\\Subscriber。',
      '',
      `构建时间：${new Date().toLocaleString('zh-CN')}`,
      `版本：${pkg.version}`,
    ].join('\r\n'),
    'utf8'
  )

  const totalSize = fs.statSync(exeTarget).size
  log(`主程序 ${(totalSize / 1024 / 1024).toFixed(0)} MB`)
  log(`完成：${appDir}`)
}

main().catch(error => fail(`打包失败：${error.message}`))
