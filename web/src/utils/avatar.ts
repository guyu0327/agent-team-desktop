/**
 * 头像统一「色底 + 文字」：自定义文字/底色编码进 avatar 字段，格式 `#RRGGBB|文字`
 * （色值段可空表示自动配色，文字段可空表示取名称首字）。
 * data:/http 图片（微信/QQ 官方通道图标）原样透传；旧表情等无法解析的值视为未自定义。
 */

export const AVATAR_PALETTE = ['#e8875b', '#5b9bd5', '#70ad47', '#9b6bc9', '#d56aa0', '#4db6ac', '#c9a44a']

export interface AvatarTextSpec {
  kind: 'text'
  /** 自定义底色（缺省按名字哈希取调色板） */
  color?: string
  /** 自定义文字（缺省取名称首字） */
  text?: string
}

export function parseAvatar(avatar?: string | null): { kind: 'image'; src: string } | AvatarTextSpec | null {
  if (!avatar) return null
  if (avatar.startsWith('http') || avatar.startsWith('data:')) return { kind: 'image', src: avatar }
  const m = /^#([0-9a-fA-F]{6})?\|(.*)$/s.exec(avatar)
  if (!m) return null
  const text = m[2].trim()
  return { kind: 'text', color: m[1] ? `#${m[1]}` : undefined, text: text || undefined }
}

export function encodeAvatar(text: string, color?: string): string {
  const t = text.trim()
  // color 入参可能自带 '#'（调色板色值），统一剥掉保证 `#RRGGBB|文字` 线上格式
  const c = color?.replace(/^#/, '') ?? ''
  if (!t && !c) return ''
  return `#${c}|${t}`
}

/** 按名字哈希取调色板底色（同名同色，稳定不变） */
export function hashColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
