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
  /** 会话类别：chat=普通聊天（消息页）| task=定时任务线程/群（任务页） */
  category?: 'chat' | 'task'
  agentId?: string | null
  name: string
  memberIds: string[]
  /** 群聊聊天模式：passive（@谁谁回）| free（成员接龙自由讨论） */
  chatMode?: 'passive' | 'free'
  pinned?: boolean
  lastMessage: string
  lastMessageTime: number | null
  unreadCount: number
  /** 历史会话归档时间：非空表示已归档（仅历史会话接口返回） */
  archivedTime?: number | null
  /** 来源通道：wechat=iLink 微信会话（桌面端只读，头像/名称固定为 ClawBot） */
  channel?: string | null
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
  /** 定时任务回合标注：本条消息由哪个定时任务触发产生 */
  taskId?: string | null
  taskName?: string | null
}

/** 定时任务：到点向绑定会话发合成用户消息触发智能体回复 */
export interface ScheduledTask {
  id: string
  conversationId: string
  agentId: string
  name: string
  content: string
  kind: 'once' | 'daily' | 'weekly' | 'interval'
  runAt: number | null
  timeOfDay: string | null
  daysOfWeek: string | null
  intervalMinutes: number | null
  nextRunAt: number | null
  lastRunAt: number | null
  status: 'active' | 'paused' | 'done'
  /** normal=普通任务（智能体独立执行）| collab=协作任务（编排者拉成员建群） */
  mode?: 'normal' | 'collab'
  /** 错过的单次任务启动时是否补发 */
  catchUp?: boolean
  /** 后台触发回合是否自动放行写改文件（默认开） */
  autoWrite?: boolean
  /** 后台触发回合是否自动放行执行终端命令（默认关） */
  autoShell?: boolean
  createdAt: number
}

/** 任务会话 + 其下全部任务（任务页左列表项） */
export interface TaskGroup {
  conversation: Conversation
  tasks: ScheduledTask[]
}

/** 定时任务创建/更新入参 */
export interface TaskDraft {
  agentId?: string
  memberIds?: string[]
  name: string
  content: string
  kind: 'once' | 'daily' | 'weekly' | 'interval'
  runAt?: number | null
  timeOfDay?: string | null
  daysOfWeek?: string | null
  intervalMinutes?: number | null
  status?: 'active' | 'paused'
  mode?: 'normal' | 'collab'
  catchUp?: boolean
  autoWrite?: boolean
  autoShell?: boolean
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
