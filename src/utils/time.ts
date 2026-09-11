const DAY = 24 * 60 * 60 * 1000
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
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
  if (diff < 2 * DAY) return `昨天 ${formatTime(ts)}`
  if (diff < 7 * DAY) return WEEKDAYS[new Date(ts).getDay()]

  const d = new Date(ts)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

export function formatDividerTime(ts: number): string {
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const diff = today - day

  if (diff < DAY) return formatTime(ts)
  if (diff < 2 * DAY) return `昨天 ${formatTime(ts)}`

  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${formatTime(ts)}`
}
