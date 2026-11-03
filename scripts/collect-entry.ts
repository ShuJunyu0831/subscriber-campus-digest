/**
 * collect.mjs 的入口：只负责调 fetchLiveCompetitions 并输出。
 * 单独成文件是为了让 esbuild 的 bundle 边界清晰（不把 scripts/ 里的 Node 代码混进去）。
 */
export { fetchLiveCompetitions } from '../src/liveSource'
