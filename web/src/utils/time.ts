import { t, tArr } from '@/i18n'

const DAY = 24 * 60 * 60 * 1000

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 本地日期键 YYYY-MM-DD（分组用，跨月/夏令时安全） */
export function dayKeyOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 分组标签：今天 | 昨天 | YYYY-MM-DD */
export function dayLabelOf(ts: number): string {
  const today = dayKeyOf(Date.now())
  const key = dayKeyOf(ts)
  if (key === today) return t('time.today')
  if (key === dayKeyOf(Date.now() - DAY)) return t('time.yesterday')
  return key
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatConversationTime(ts: number | null | undefined): string {
  if (!ts) return ''
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const diff = today - day

  if (diff < 0) return formatTime(ts)
  if (diff < DAY) return formatTime(ts)
  if (diff < 2 * DAY) return t('time.yesterdayTime', { time: formatTime(ts) })
  if (diff < 7 * DAY) return tArr('time.weekdays')[new Date(ts).getDay()]

  const d = new Date(ts)
  return t('time.shortDate', {
    y: d.getFullYear(),
    m: pad(d.getMonth() + 1),
    d: pad(d.getDate()),
  })
}

export function formatDividerTime(ts: number): string {
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const diff = today - day

  if (diff < DAY) return formatTime(ts)
  if (diff < 2 * DAY) return t('time.yesterdayTime', { time: formatTime(ts) })

  const d = new Date(ts)
  return t('time.dividerDate', {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    time: formatTime(ts),
  })
}
