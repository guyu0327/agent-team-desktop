import { t } from '@/i18n'
import type { Conversation } from '@/types'
import { QQ_AVATAR, WECHAT_AVATAR } from '@/constants/channelAvatars'

/**
 * 通道会话（微信/QQ）的显示名与头像：微信「微信 · 尾8」+ 官方微信图标；
 * QQ 私聊「QQ · 尾8」、群聊「QQ群 · 尾8」（群取群 openid，避免与同用户私聊撞名）+ 官方企鹅图标。
 * 非通道会话返回 null，由调用方按智能体/群名展示。
 */
export function channelConversation(c: Conversation): { name: string; avatar: string } | null {
  if (c.channel === 'wechat')
    return { name: c.wechatPeer ? `${t('chat.wechatName')} · ${c.wechatPeer}` : t('chat.wechatName'), avatar: WECHAT_AVATAR }
  if (c.channel === 'qq') {
    const label = c.qqKind === 'group' ? t('chat.qqGroupName') : t('chat.qqName')
    return { name: c.qqPeer ? `${label} · ${c.qqPeer}` : label, avatar: QQ_AVATAR }
  }
  return null
}
