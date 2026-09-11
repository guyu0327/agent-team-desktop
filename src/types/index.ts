export interface User {
  id: string
  name: string
  avatar: string
  signature?: string
}

/** 模型名/API 地址/Key 保存在关联的模型预设中，智能体只存 presetId */
export interface Agent {
  id: string
  name: string
  avatar: string
  groupName: string
  description: string
  presetId: string
  /** 为 true 时聊天中作为团队编排者，协调其他智能体协作 */
  isOrchestrator: boolean
  systemPrompt: string
  temperature: number
}

export type AgentDraft = Omit<Agent, 'id'>

export interface Conversation {
  id: string
  type: 'single' | 'group'
  agentId?: string | null
  name: string
  memberIds: string[]
  pinned?: boolean
  lastMessage: string
  lastMessageTime: number | null
  unreadCount: number
}

export interface Message {
  id: string
  conversationId: string
  senderType: 'user' | 'agent' | 'system'
  senderId: string
  content: string
  timestamp: number
  type: 'text' | 'image' | 'error'
}

/** 模型预设：apiKey 会返回（供智能体表单只读展示） */
export interface ModelPreset {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  remark: string
}

/** 编辑时 apiKey 留空表示保持不变 */
export interface ModelPresetDraft {
  name: string
  baseUrl: string
  apiKey?: string
  remark: string
}

/** 智能体文件沙箱设置：主工作区 + 白名单目录，均为当前生效的绝对路径 */
export interface WorkspaceSettings {
  root: string
  extraDirs: string[]
}
