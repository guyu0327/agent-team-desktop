import type { Conversation, Message } from '@/types'
import { listAgents } from '@/api/agent'
import { listMessages } from '@/api/conversation'
import { desktop } from '@/api/desktop'
import { alertAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { t } from '@/i18n'
import { formatDateTime } from '@/utils/time'

export type ExportKind = 'single' | 'group' | 'task' | 'history'

interface SaveResult {
  ok?: boolean
  path?: string
  error?: string
  canceled?: boolean
}

/** 分页拉全量消息：首页是最新的 200 条（时间正序），按每页最早时间戳向更早翻，最后整链拼接 */
async function loadAllMessages(conversationId: string): Promise<Message[]> {
  const pages: Message[][] = []
  let before: number | undefined
  for (;;) {
    const page = await listMessages(conversationId, before, 200)
    pages.unshift(page.list)
    if (!page.hasMore || page.list.length === 0) break
    before = page.list[0].timestamp
  }
  return pages.flat()
}

/** 智能体 ID → 名字；拉取失败时退回显示 ID */
async function nameResolver(): Promise<(id: string) => string> {
  const map = new Map<string, string>()
  try {
    for (const a of await listAgents()) map.set(a.id, a.name)
  } catch {
    /* 忽略：名字缺失时由回调退回 ID */
  }
  return (id) => map.get(id) ?? (id || t('common.unknownAgent'))
}

function kindLabelOf(conv: Conversation, kind: ExportKind): string {
  if (kind === 'task') return t('export.kindTask')
  if (kind === 'history') return t('export.kindHistory')
  if (conv.type === 'group') {
    return (conv.chatMode ?? 'passive') === 'free' ? t('export.kindGroupFree') : t('export.kindGroup')
  }
  return t('export.kindSingle')
}

function buildMarkdown(
  conv: Conversation,
  kind: string,
  msgs: Message[],
  nameOf: (id: string) => string,
): string {
  const out: string[] = []
  out.push(`# ${conv.name?.trim() || t('export.untitled')}`)
  const meta = [`${t('export.kind')}${kind}`]
  if (conv.type === 'group') {
    meta.push(`${t('export.members')}${conv.memberIds.map(nameOf).join(t('export.memberSep'))}`)
  }
  meta.push(`${t('export.exportedAt')}${formatDateTime(Date.now())}`)
  out.push(`- ${meta.join(' · ')}`, '', '---', '')
  for (const m of msgs) {
    if (m.type === 'system' || m.senderType === 'system') {
      out.push(`> ${t('export.systemNote')}${m.content}`, '')
      continue
    }
    const who = m.senderType === 'user' ? t('export.user') : nameOf(m.senderId)
    const withTask = m.taskName ? t('export.taskSuffix', { name: m.taskName }) : ''
    out.push(`**${who}${withTask}** ${formatDateTime(m.timestamp)}`)
    const body = m.content?.trim()
    if (m.type === 'error') {
      out.push(`> ${t('export.errorNote')}${body || ''}`)
    } else {
      out.push(body || '……')
      for (const att of m.attachments ?? []) {
        out.push(`> ${t('export.attachmentNote', { name: att.name, path: att.path })}`)
      }
    }
    out.push('')
  }
  return out.join('\n')
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return (cleaned || t('export.untitled')).slice(0, 80)
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 浏览器模式回退：普通下载（无另存为对话框） */
function downloadFallback(name: string, content: string): Promise<SaveResult> {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return Promise.resolve({ ok: true })
}

/** 导出会话全部消息为 Markdown 文件：附件仅标注文本不导出实际文件 */
export async function exportConversation(conv: Conversation, kind: ExportKind): Promise<void> {
  try {
    const [nameOf, msgs] = await Promise.all([nameResolver(), loadAllMessages(conv.id)])
    const md = buildMarkdown(conv, kindLabelOf(conv, kind), msgs, nameOf)
    const filename = `${sanitizeFilename(conv.name || t('export.untitled'))}-${stamp()}.md`
    const r: SaveResult = desktop?.saveTextFile
      ? await desktop.saveTextFile(filename, md)
      : await downloadFallback(filename, md)
    if (!r || r.canceled) return
    if (r.ok) showToast(t('export.done'))
    else alertAction(r.error || t('export.failed'))
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('export.failed'))
  }
}
