import { ref } from 'vue'
import zh from './locales/zh'
import en from './locales/en'

/** 界面语言（持久化键与外观设置共用 system-lang） */
export type AppLang = 'zh' | 'en'

const LANG_KEY = 'system-lang'

type Messages = typeof zh

const catalogs: Record<AppLang, Messages> = { zh, en }

export const locale = ref<AppLang>(
  localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh',
)

export function setLocale(lang: AppLang) {
  locale.value = lang
}

function resolve(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof cur === 'string' ? cur : undefined
}

/** 取词条：先当前语言，缺漏回退中文，再回退键名；支持 {name} 插值 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = resolve(catalogs[locale.value], key) ?? resolve(zh, key) ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}

/** 取数组词条（如星期名）；先当前语言，缺漏回退中文 */
export function tArr(key: string): string[] {
  const dict = (d: unknown): string[] => {
    let cur: unknown = d
    for (const part of key.split('.')) {
      if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part]
      } else {
        return []
      }
    }
    return Array.isArray(cur) ? cur.map(String) : []
  }
  return dict(catalogs[locale.value]).length ? dict(catalogs[locale.value]) : dict(zh)
}
