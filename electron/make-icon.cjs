/**
 * 从 build/icon.png 生成多尺寸 build/icon.ico。
 *
 * 为什么自己写缩放：项目里没有 sharp/png-to-ico 的等比缩放能力，
 * png-to-ico 只负责把若干张同尺寸 PNG 打成 ICO。这里用 pngjs 解码后
 * 做面积平均（box filter）下采样，再交给 png-to-ico 打包。
 *
 * 用法：node electron/make-icon.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const root = path.join(__dirname, '..')
const sourceFile = path.join(root, 'build', 'icon.png')
const targetFile = path.join(root, 'build', 'icon.ico')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

const pngToIcoModule = require('png-to-ico')
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule.default

function decode(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

/**
 * 面积平均下采样。按源像素覆盖目标像素的面积加权，
 * 比最近邻更不容易把细白条缩没。
 */
function resize(image, size) {
  const target = new PNG({ width: size, height: size })
  const scaleX = image.width / size
  const scaleY = image.height / size

  for (let y = 0; y < size; y += 1) {
    const y0 = y * scaleY
    const y1 = y0 + scaleY
    for (let x = 0; x < size; x += 1) {
      const x0 = x * scaleX
      const x1 = x0 + scaleX
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let total = 0

      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        if (wy <= 0) continue
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          if (wx <= 0) continue
          const weight = wx * wy
          const offset = (sy * image.width + sx) << 2
          // 预乘 alpha 后加权，否则透明边缘会偏亮
          const alpha = image.data[offset + 3] / 255
          r += image.data[offset] * alpha * weight
          g += image.data[offset + 1] * alpha * weight
          b += image.data[offset + 2] * alpha * weight
          a += alpha * weight
          total += weight
        }
      }

      const offset = (y * size + x) << 2
      if (a > 0) {
        target.data[offset] = Math.round(r / a)
        target.data[offset + 1] = Math.round(g / a)
        target.data[offset + 2] = Math.round(b / a)
      }
      target.data[offset + 3] = Math.round((a / total) * 255)
    }
  }

  return PNG.sync.write(target)
}

async function main() {
  const source = decode(sourceFile)
  process.stdout.write(`• 源图 ${source.width}×${source.height}\n`)

  const buffers = SIZES.map(size => {
    // 源图足够大时直接缩放；只在目标小于源图时才需要
    const buffer = size >= source.width ? fs.readFileSync(sourceFile) : resize(source, size)
    return buffer
  })
  process.stdout.write(`• 生成尺寸 ${SIZES.join(' / ')}\n`)

  const ico = await pngToIco(buffers)
  fs.writeFileSync(targetFile, ico)
  process.stdout.write(`• 完成：${targetFile}（${(ico.length / 1024).toFixed(1)} KB）\n`)
}

main().catch((error) => {
  process.stderr.write(`生成图标失败：${error.message}\n`)
  process.exit(1)
})
