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
  /** 可选绑定的图像预设（文生图类），绑定的智能体才有 generate_image 生图工具 */
  imagePresetId: string
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
  /** 群聊聊天模式：passive（@谁谁回）| free（成员接龙自由讨论） */
  chatMode?: 'passive' | 'free'
  pinned?: boolean
  lastMessage: string
  lastMessageTime: number | null
  unreadCount: number
}

/** 消息/授权共用的附件信息：path 为服务器上的真实绝对路径；image 类型可直接展示并交给视觉模型 */
export interface Attachment {
  path: string
  type: 'file' | 'dir' | 'image'
  name: string
}

export interface Message {
  id: string
  conversationId: string
  senderType: 'user' | 'agent' | 'system'
  senderId: string
  content: string
  attachments?: Attachment[]
  timestamp: number
  type: 'text' | 'error'
}

/** 会话已授权的文件/目录 */
export interface FileGrant {
  path: string
  type: 'file' | 'dir' | 'image'
  name: string
  grantedAt: number
}

/** 预设协议类型：openai-chat 对话 / dashscope-image、openai-image、siliconflow-image 文生图 */
export type ModelPresetProtocol = 'openai-chat' | 'dashscope-image' | 'openai-image' | 'siliconflow-image'

/** 模型预设：apiKey 永不返回，仅回传 hasKey 状态 */
export interface ModelPreset {
  id: string
  name: string
  protocol: ModelPresetProtocol
  baseUrl: string
  hasKey: boolean
  remark: string
}

/** 编辑时 apiKey 留空表示保持不变 */
export interface ModelPresetDraft {
  name: string
  protocol: ModelPresetProtocol
  baseUrl: string
  apiKey?: string
  remark: string
}

/** 智能体文件沙箱设置：主工作区 + 白名单目录，均为当前生效的绝对路径 */
export interface WorkspaceSettings {
  root: string
  extraDirs: string[]
}

/** 受控操作审批请求：智能体调用 write_file / edit_file / execute 时弹出卡片等待用户决定 */
export interface OpRequest {
  requestId: string
  conversationId: string
  opType: 'write' | 'edit' | 'shell'
  agentId: string
  agentName: string
  /** 操作目标：文件路径（shell 命令为 null） */
  target: string | null
  /** 操作详情：写入内容 / 修改前后对照 / 命令文本 */
  detail: string | null
}

/** 实时语音识别服务：讯飞流式听写的鉴权三参（PUT 请求体，密钥留空 = 保持不变） */
export interface AsrStreamSettings {
  appId: string
  apiKey: string
  apiSecret: string
}

/** 实时语音识别配置状态（GET/PUT 响应，永不返回密钥明文） */
export interface AsrStreamStatus {
  appId: string
  hasKey: boolean
  hasSecret: boolean
  configured: boolean
}
