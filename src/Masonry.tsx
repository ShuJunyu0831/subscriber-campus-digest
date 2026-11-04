import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 瀑布流布局（masonry）。
 *
 * 做法参考 react-bits 的 Masonry：按「当前最矮的一列」依次放置每一块，
 * 所以高度参差的卡片能自然错落，而不是被压成等高网格。
 *
 * 为什么自己写而不用那个组件：
 * react-bits 的 Masonry 是**图片画廊**——每个 tile 的内容硬编码成 `<img src={item.img}>`，
 * 还带 lightbox、拖动排序、视差。回顾页要展示的是文字卡片（标题/摘要/分类/完成时间），
 * 没有图片、也不需要灯箱，套上去只能塞占位图，反而丢信息。
 * 这里只保留它的布局与入场节奏（交错浮现 + 由虚到实），内容完全由调用方决定。
 *
 * 实现上不追求通用：只做「等高列宽 + 绝对定位」这一件事，
 * 用 ResizeObserver 跟随容器宽度重排，用 CSS transition 做移动过渡。
 */

interface MasonryProps {
  children: ReactNode
  /** 期望的单列最小宽度（px），列数由容器宽度算出 */
  minColumnWidth?: number
  /** 卡片间距（px） */
  gap?: number
  /** 最多几列 */
  maxColumns?: number
  className?: string
  /** 无障碍标签，读屏会用 */
  label?: string
}

export default function Masonry({
  children,
  minColumnWidth = 260,
  gap = 14,
  maxColumns = 4,
  className = '',
  label,
}: MasonryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [contentVersion, setContentVersion] = useState(0)

  // 跟随容器宽度，并观察卡片自身高度：字体加载、展开正文后也要重新排布。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setContentVersion(value => value + 1))
    }
    const observer = new ResizeObserver(entries => {
      const rootEntry = entries.find(entry => entry.target === root)
      if (rootEntry) {
        const next = Math.round(rootEntry.contentRect.width)
        setWidth(current => (current === next ? current : next))
      }
      schedule()
    })
    observer.observe(root)
    for (const tile of Array.from(root.children)) observer.observe(tile)
    setWidth(Math.round(root.getBoundingClientRect().width))
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [children])

  // 排布：定宽 → 量高 → 放进最矮的一列 → 写回 transform
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || width === 0) return

    const tiles = Array.from(root.children) as HTMLElement[]
    if (tiles.length === 0) {
      root.style.height = '0px'
      return
    }

    // 列数不能超过卡片数，否则只剩一条窄卡孤零零地待在第一列
    const fit = Math.floor((width + gap) / (minColumnWidth + gap))
    const columns = Math.max(1, Math.min(maxColumns, fit, tiles.length))
    const columnWidth = (width - gap * (columns - 1)) / columns

    // 先统一宽度再量高度，避免按旧宽度测量导致错位
    tiles.forEach(tile => { tile.style.width = `${columnWidth}px` })

    const heights = new Array(columns).fill(0)
    tiles.forEach((tile, index) => {
      let target = 0
      for (let column = 1; column < columns; column += 1) {
        if (heights[column] < heights[target]) target = column
      }
      const x = target * (columnWidth + gap)
      const y = heights[target]
      tile.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
      heights[target] = y + tile.offsetHeight + gap

      // 只让新出现的卡片播放入场动画；单纯重排时保持原样，避免闪一下
      if (!tile.dataset.shown) {
        tile.dataset.shown = '1'
        tile.style.transitionDelay = `${Math.min(index, 12) * 45}ms`
        requestAnimationFrame(() => tile.classList.add('masonry-in'))
      }
    })

    root.style.height = `${Math.max(0, Math.max(...heights) - gap)}px`
  }, [children, width, gap, minColumnWidth, maxColumns, contentVersion])

  return (
    <div
      ref={rootRef}
      className={`masonry ${className}`.trim()}
      role={label ? 'group' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  )
}
