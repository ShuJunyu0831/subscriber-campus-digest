/**
 * 给 Subscriber.exe 写入应用图标与版本信息。
 *
 * 为什么不用 rcedit：它需要从 GitHub 下载预编译二进制，本机网络环境下
 * 安装超时。resedit 是纯 JavaScript 的 PE 资源编辑器，没有外部依赖。
 *
 * 注意：electron.exe 自带数字签名，改动资源后签名会失效（开发版可接受），
 * 因此读取时必须传 ignoreCert。
 *
 * 用法：node electron/patch-exe.cjs [exe 路径]
 */
const fs = require('node:fs')
const path = require('node:path')
const ResEdit = require('resedit')

const root = path.join(__dirname, '..')
const exePath = path.resolve(process.argv[2] || path.join(root, 'desktop-dist', 'Subscriber', 'Subscriber.exe'))
const icoPath = path.join(root, 'build', 'icon.ico')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function log(step) {
  process.stdout.write(`• ${step}\n`)
}

if (!fs.existsSync(exePath)) {
  process.stderr.write(`找不到主程序：${exePath}\n`)
  process.exit(1)
}
if (!fs.existsSync(icoPath)) {
  process.stderr.write(`找不到图标：${icoPath}，请先运行 node electron/make-icon.cjs\n`)
  process.exit(1)
}

const binary = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
const resource = ResEdit.NtExecutableResource.from(binary)

// 1. 图标：沿用 electron.exe 已有的图标组 id / 语言，只替换内容
log('写入图标资源')
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath))
const iconDatas = iconFile.icons.map(icon => icon.data)
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries)
if (groups.length === 0) {
  // electron.exe 没有图标组时建一个，id=1 lang=1033 是最通用的组合
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 1033, iconDatas)
} else {
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resource.entries, group.id, group.lang, iconDatas)
  }
}

// 2. 版本信息：覆盖产品名、描述等字符串，让属性面板显示 Subscriber 而不是 Electron
log('写入版本信息')
const versionList = ResEdit.Resource.VersionInfo.fromEntries(resource.entries)
if (versionList.length > 0) {
  const version = versionList[0]
  const versionString = pkg.version
  const strings = {
    ProductName: 'Subscriber',
    FileDescription: pkg.description || 'Subscriber',
    CompanyName: 'Subscriber',
    LegalCopyright: `Copyright © ${new Date().getFullYear()} Subscriber`,
    InternalName: 'Subscriber',
    OriginalFilename: 'Subscriber.exe',
  }

  for (const language of version.getAvailableLanguages()) {
    version.setStringValues(language, strings)
    version.setFileVersion(versionString, language.lang)
    version.setProductVersion(versionString, language.lang)
  }

  // outputToResourceEntries 是追加，需要先摘掉旧的 RT_VERSION 条目
  for (let index = resource.entries.length - 1; index >= 0; index -= 1) {
    if (resource.entries[index].type === 16) resource.entries.splice(index, 1)
  }
  version.outputToResourceEntries(resource.entries)
}

resource.outputResource(binary)
const output = Buffer.from(binary.generate())

// 先写临时文件再替换，避免中途失败把 exe 写坏
const tempPath = `${exePath}.tmp`
fs.writeFileSync(tempPath, output)
try {
  fs.rmSync(exePath, { force: true })
} catch {
  process.stderr.write('无法覆盖 exe，请先关闭正在运行的 Subscriber\n')
  process.exit(1)
}
fs.renameSync(tempPath, exePath)

// 3. 回读校验，确认资源真的写进去了
const verify = ResEdit.NtExecutableResource.from(
  ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
)
const verifiedGroups = ResEdit.Resource.IconGroupEntry.fromEntries(verify.entries)
const verifiedVersions = ResEdit.Resource.VersionInfo.fromEntries(verify.entries)
const productName = verifiedVersions[0]?.getStringValues(verifiedVersions[0].getAvailableLanguages()[0])?.ProductName
log(`校验：图标组 ${verifiedGroups.length} 个，图标 ${verifiedGroups[0]?.icons.length ?? 0} 张，产品名「${productName}」`)
log(`完成：${exePath}`)
