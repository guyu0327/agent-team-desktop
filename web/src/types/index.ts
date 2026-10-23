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
  /** 启用的技能 ID 列表（技能目录名），聊天中智能体按需加载 */
  skillIds: string[]
}

export type AgentDraft = Omit<Agent, 'id'>

/** 智能体长期记忆条目（聊天中智能体自行记录，详情页可管理） */
export interface AgentMemory {
  id: string
  content: string
  createdAt: number
}

/** 技能列表项 */
export interface Skill {
  skillId: string
  name: string
  description: string
  updatedAt: number | null
  /** 绑定了该技能的智能体数量 */
  agentCount: number
  /** 全局技能：所有智能体可用（含未单独勾选的） */
  global: boolean
}

export interface SkillDetail {
  skillId: string
  name: string
  description: string
  /** SKILL.md 正文（不含 frontmatter） */
  content: string
  updatedAt: number | null
  /** 全局技能：所有智能体可用（含未单独勾选的） */
  global: boolean
  /** 技能目录绝对路径（打开资源管理器用） */
  dir: string
  /** 辅助文件相对路径清单（不含 SKILL.md/scope.json） */
  resources: string[]
}

export interface SkillDraft {
  skillId: string
  name: string
  description: string
  content: string
}

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
  /** 微信好友短标识：非空时显示为「微信ClawBot-xxxx」区分不同好友的会话 */
  wechatPeer?: string | null
}

/** 消息/授权共用的附件信息：path 为服务器上的真实绝对路径；image 类型可直接展示并交给视觉模型 */
export interface Attachment {
  path: string
  type: 'file' | 'dir' | 'image'
  name: string
}

/** 单次联网活动：搜索（关键词+来源站点）或网页抓取（URL+页面标题） */
export interface WebActivityItem {
  tool: 'web_search' | 'fetch_webpage'
  query?: string
  sites?: string[]
  url?: string
  title?: string
  ok?: boolean
  error?: string
}

/** 单次浏览器操作记录：打开/点击/输入等（end 阶段带结果与自动截图路径） */
export interface BrowseActivityItem {
  tool: string
  url?: string
  ref?: string
  title?: string
  ok?: boolean
  error?: string
  /** 自动截图的本地文件路径（fsContentUrl 可展示） */
  screenshot?: string | null
  direction?: string
}

/** 通用工具调用记录：文件/命令/图片/技能/定时任务等（仅 end 阶段落库） */
export interface ToolActivityItem {
  tool: string
  ok?: boolean
  state?: string
  /** 目标详情：文件/目录为绝对路径，命令/提示词/名称为原文摘要 */
  target?: string
  /** 可打开的本地路径（文件/目录类工具才有）：点击用系统默认方式打开 */
  openPath?: string
}

export interface Message {
  id: string
  conversationId: string
  senderType: 'user' | 'agent' | 'system'
  senderId: string
  content: string
  attachments?: Attachment[]
  timestamp: number
  type: 'text' | 'error' | 'system'
  /** 定时任务回合标注：本条消息由哪个定时任务触发产生 */
  taskId?: string | null
  taskName?: string | null
  /** 本条回复前的联网活动（搜索/抓取记录），渲染为气泡下折叠条 */
  webActivity?: WebActivityItem[] | null
  /** 本条回复中的浏览器操作记录（含自动截图），渲染为气泡下折叠条 */
  browseActivity?: BrowseActivityItem[] | null
  /** 本条回复中的通用工具调用记录（文件/命令/技能等），渲染为气泡下折叠条 */
  toolActivity?: ToolActivityItem[] | null
  /** 本条回复的思考过程全文（推理模型），渲染为气泡下折叠条；不进对话上下文 */
  thinking?: string | null
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
  /** 后台触发回合是否自动放行打开网页（默认关） */
  autoBrowser?: boolean
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
  autoBrowser?: boolean
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
  /** 推理强度：空串不发送该参数，部分服务商需显式 low/medium/high 开启思考 */
  reasoningEffort: string
}

/** 编辑时 apiKey 留空表示保持不变 */
export interface ModelPresetDraft {
  name: string
  protocol: ModelPresetProtocol
  baseUrl: string
  apiKey?: string
  remark: string
  reasoningEffort: string
}

/** 测试连接结果：ok=false 时 message 为简要失败原因 */
export interface ModelPresetTestResult {
  ok: boolean
  latencyMs: number
  reply: string
  message: string
}

/** 一句话自动生成的智能体基础配置（预设与技能不参与生成） */
export interface AgentAutoFillDraft {
  name: string
  avatar: string
  groupName: string
  description: string
  systemPrompt: string
  temperature: number
}

/** 智能体文件沙箱设置：主工作区 + 白名单目录，均为当前生效的绝对路径 */
export interface WorkspaceSettings {
  root: string
  extraDirs: string[]
}

/** 受控操作审批请求：智能体调用 write_file / edit_file / execute / browser_open 时弹出卡片等待用户决定 */
export interface OpRequest {
  requestId: string
  conversationId: string
  opType: 'write' | 'edit' | 'shell' | 'browser' | 'computer'
  agentId: string
  agentName: string
  /** 操作目标：文件路径（shell 命令为 null） */
  target: string | null
  /** 操作详情：写入内容 / 修改前后对照 / 命令文本 */
  detail: string | null
}

/** 智能体提问：一次一个问题，逐个弹卡；选项 ≤3 个，「其他」自由输入由前端自动附加 */
export interface AskRequest {
  requestId: string
  conversationId: string
  agentId: string
  agentName: string
  question: string
  options: string[]
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

/** 联网搜索（AnySearch）配置（PUT 请求体，Key 留空 = 保持不变） */
export interface AnySearchSettings {
  apiKey: string
}

/** 联网搜索配置状态（GET/PUT/DELETE 响应，永不返回密钥明文）；未配 Key 时搜索走匿名免费档 */
export interface AnySearchStatus {
  hasKey: boolean
}
