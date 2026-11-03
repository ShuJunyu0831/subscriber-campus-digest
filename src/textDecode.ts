/**
 * 文本解码兜底：微信 / 老版钉钉导出的聊天记录经常是 GBK（GB18030）编码，
 * 直接按 UTF-8 解会整段变乱码。这里先按 UTF-8 严格解码，失败再退到 GB18030，
 * 都失败才用宽松 UTF-8 兜底（宁可留几个替换字符，也不要抛异常把整条文件丢掉）。
 */

const utf8Strict = new TextDecoder('utf-8', { fatal: true })
const utf8Loose = new TextDecoder('utf-8')

export function decodeTextBytes(bytes: Uint8Array): string {
  // BOM：UTF-8 / UTF-16LE / UTF-16BE
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return utf8Loose.decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    try { return new TextDecoder('utf-16le').decode(bytes.subarray(2)) } catch { /* 落到下面 */ }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    try { return new TextDecoder('utf-16be').decode(bytes.subarray(2)) } catch { /* 落到下面 */ }
  }

  try {
    return utf8Strict.decode(bytes)
  } catch {
    // 不是合法 UTF-8，按中文环境最常见的 GB18030 再试一次
  }
  try {
    return new TextDecoder('gb18030').decode(bytes)
  } catch {
    return utf8Loose.decode(bytes)
  }
}
