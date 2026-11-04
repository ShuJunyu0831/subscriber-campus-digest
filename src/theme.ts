// 三态主题：跟随系统 / 浅色 / 深色。
// 选择存 localStorage；系统模式下不写 data-theme，交给 CSS 的 prefers-color-scheme。
import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_KEY = 'subscriber-theme'

export function readTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  // 让窗口边框/滚动条也跟着变
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolvedIsDark(choice) ? '#121310' : '#f2efe6')
}

function resolvedIsDark(choice: ThemeChoice): boolean {
  if (choice === 'light') return false
  if (choice === 'dark') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)

  useEffect(() => {
    applyTheme(choice)
    try {
      localStorage.setItem(THEME_KEY, choice)
    } catch {
      // 隐私模式下写不进去，主题仍按本次选择生效
    }
  }, [choice])

  // 跟随系统时，系统切换要同步 meta theme-color
  useEffect(() => {
    if (choice !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])

  const next = useCallback(() => {
    setChoice(current => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'))
  }, [])

  return { choice, setChoice, next, isDark: resolvedIsDark(choice) }
}
