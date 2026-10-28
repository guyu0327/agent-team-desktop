import { request } from './http'

export interface QqChannelSettings {
  enabled: boolean
  agentId: string
  autoWrite: boolean
  autoShell: boolean
  maxReplyChars: number
  roundTimeoutMinutes: number
  /** 私聊策略：open 开放 / whitelist 白名单 / off 停用 */
  c2cPolicy: 'open' | 'whitelist' | 'off'
  c2cWhitelist: string[]
  /** 群聊策略：同上三档，控制哪些群允许响应 */
  groupPolicy: 'open' | 'whitelist' | 'off'
  groupWhitelist: string[]
}

export interface QqSeenPeer {
  kind: 'c2c' | 'group'
  openid: string
  groupOpenid: string | null
  /** 平台随事件下发的用户名（author.username），可能为 null */
  name: string | null
  preview: string
  lastSeenAt: number
}

export interface QqStatus extends QqChannelSettings {
  connected: boolean
  appId: string | null
  savedAt: string | null
  /** 机主（扫码绑定人）openid：前端用于区分群里哪些 user 消息是自己发的 */
  ownerOpenid: string | null
  seen: QqSeenPeer[]
}

export function getQqStatus(): Promise<QqStatus> {
  return request('/qq/status')
}

export function updateQqSettings(s: QqChannelSettings): Promise<QqStatus> {
  return request('/qq/settings', { method: 'PUT', body: s })
}

/** 保存凭证：后端先实测换 token，失败直接抛错不落库；ownerOpenid 为扫码绑定人（机主） */
export function saveQqCredential(appId: string, appSecret: string, ownerOpenid?: string): Promise<QqStatus> {
  return request('/qq/credential', { method: 'POST', body: { appId, appSecret, ownerOpenid: ownerOpenid ?? '' } })
}

export function disconnectQq(): Promise<QqStatus> {
  return request('/qq/disconnect', { method: 'POST' })
}

/** 重置 QQ 会话：旧会话归档进历史（不可恢复聊天），返回新会话 id */
export function resetQqConversation(conversationId: string): Promise<{ conversationId: string }> {
  return request('/qq/reset', { method: 'POST', body: { conversationId } })
}

/** 扫码绑定第一步：创建绑定任务，qrUrl 为二维码内容（渲染成图片供手机 QQ 扫） */
export function startQqQr(): Promise<{ taskId: string; qrUrl: string }> {
  return request('/qq/qr/start', { method: 'POST' })
}

/** 扫码绑定轮询：pending 等待 / completed 携带凭据与机主 openid / expired 需重建换新码 */
export function pollQqQr(
  taskId: string,
): Promise<{ status: 'pending' | 'completed' | 'expired'; appId: string; appSecret: string; ownerOpenid: string }> {
  return request('/qq/qr/poll', { method: 'POST', body: { taskId } })
}
