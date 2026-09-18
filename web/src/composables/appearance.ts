import { desktop } from '@/api/desktop'
import { setLocale, type AppLang } from '@/i18n'

/** 主题外观与语言：localStorage 持久化（渲染层），主题另经桌面壳持久化并同步原生标题栏配色 */
export type ThemeMode = 'dark' | 'light'
export type { AppLang }

const THEME_KEY = 'system-theme'
const LANG_KEY = 'system-lang'

export function currentTheme(): ThemeMode {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_KEY, theme)
  document.documentElement.dataset.theme = theme
  void desktop?.setTheme?.(theme)
}

export function currentLang(): AppLang {
  return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'
}

export function applyLang(lang: AppLang) {
  localStorage.setItem(LANG_KEY, lang)
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  setLocale(lang)
}
