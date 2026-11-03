/**
 * collect.mjs 的入口：只负责导出采集器与订阅源解析器。
 * 单独成文件是为了让 esbuild 的 bundle 边界清晰（不把 scripts/ 里的 Node 代码混进去）。
 */
export { fetchLiveCompetitions } from '../src/liveSource'
// 桌面版主进程用同一个解析器抓 RSS，避免浏览器跨域限制（ipc: rss:fetch）
export { fetchFeed } from '../src/rss'
