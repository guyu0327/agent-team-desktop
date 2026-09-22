import { request } from './http'

export interface WechatChannelSettings {
  enabled: boolean
  agentId: string
  autoWrite: boolean
  autoShell: boolean
  maxReplyChars: number
  roundTimeoutMinutes: number
}

export interface WechatStatus extends WechatChannelSettings {
  connected: boolean
  botId: string | null
  ownerUserId: string | null
  loginInProgress: boolean
}

export type WechatLoginStatus = 'idle' | 'qr_ready' | 'scaned' | 'need_verifycode' | 'confirmed' | 'failed'

export interface WechatLoginState {
  status: WechatLoginStatus
  qrSvg: string | null
  error: string | null
  botId: string | null
}

export function getWechatStatus(): Promise<WechatStatus> {
  return request('/wechat/status')
}

export function updateWechatSettings(s: WechatChannelSettings): Promise<WechatStatus> {
  return request('/wechat/settings', { method: 'PUT', body: s })
}

export function startWechatLogin(): Promise<WechatLoginState> {
  return request('/wechat/login', { method: 'POST' })
}

export function getWechatLoginState(): Promise<WechatLoginState> {
  return request('/wechat/login/status')
}

export function submitWechatVerifyCode(code: string): Promise<WechatLoginState> {
  return request('/wechat/login/verify', { method: 'POST', body: { code } })
}

export function cancelWechatLogin(): Promise<WechatLoginState> {
  return request('/wechat/login/cancel', { method: 'POST' })
}

export function disconnectWechat(): Promise<WechatStatus> {
  return request('/wechat/disconnect', { method: 'POST' })
}

/** 重置微信会话：旧会话归档进历史（不可恢复聊天），返回新会话 id */
export function resetWechatConversation(conversationId: string): Promise<{ conversationId: string }> {
  return request('/wechat/reset', { method: 'POST', body: { conversationId } })
}
