<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { BrowseActivityItem, Message, ToolActivityItem, WebActivityItem } from '@/types'
import Avatar from '@/components/common/Avatar.vue'
import { renderMarkdown } from '@/utils/markdown'
import { fsContentUrl } from '@/utils/image'
import { openLocalPath } from '@/api/desktop'
import { showToast } from '@/composables/toast'
import { t } from '@/i18n'

const props = defineProps<{
  message: Message
  self?: boolean
  senderName: string
  senderAvatar?: string
  /** 发送者标识徽标，如编排者的「编排者」 */
  badge?: string
  typing?: boolean
  /** 进行中的思考过程流文本（thinking_delta，正文首增量到达即清空），气泡内限高滚动展示 */
  thinking?: string
  /** 是否在气泡上方显示发送者名称（群聊场景） */
  showName?: boolean
  /** 头像可交互（群聊中点他人头像 @ 对方） */
  mentionable?: boolean
}>()

const emit = defineEmits<{
  /** 左键点击头像：@ 该成员 */
  avatarClick: []
  /** 右键点击头像：弹出菜单 */
  avatarMenu: [e: MouseEvent]
  /** 右键点击气泡本体（不含周围空白/头像/昵称区） */
  bubbleMenu: [e: MouseEvent]
}>()

/** 只有智能体消息走 Markdown 渲染；自己消息和错误提示保持纯文本 */
const rendered = computed(() => renderMarkdown(props.message.content))

/** 应用内图片查看器：点气泡附件图/浏览记录截图时全屏查看，不再跳系统浏览器；滚轮缩放、按住拖动、双击回原大 */
const viewerSrc = ref<string | null>(null)
const viewerEl = ref<HTMLElement | null>(null)
const zoom = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)

let dragStartX = 0
let dragStartY = 0
let baseTx = 0
let baseTy = 0

const ZOOM_MAX = 8

function viewImage(path: string) {
  viewerSrc.value = fsContentUrl(path)
  zoom.value = 1
  tx.value = 0
  ty.value = 0
}

function closeViewer() {
  viewerSrc.value = null
}

watch(viewerSrc, (src) => {
  if (src) window.addEventListener('keydown', onViewerKey)
  else window.removeEventListener('keydown', onViewerKey)
})

function onViewerKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeViewer()
}

onUnmounted(() => window.removeEventListener('keydown', onViewerKey))

/** 滚轮缩放（1~8 倍），锚定光标下的点不漂移 */
function onWheel(e: WheelEvent) {
  const next = Math.min(ZOOM_MAX, Math.max(1, zoom.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
  const rect = viewerEl.value?.getBoundingClientRect()
  if (rect && next !== zoom.value) {
    const vx = e.clientX - (rect.left + rect.width / 2)
    const vy = e.clientY - (rect.top + rect.height / 2)
    tx.value = vx - (next / zoom.value) * (vx - tx.value)
    ty.value = vy - (next / zoom.value) * (vy - ty.value)
  }
  zoom.value = next
  if (next <= 1) {
    tx.value = 0
    ty.value = 0
  }
}

function onDragStart(e: PointerEvent) {
  if (e.button !== 0 || zoom.value <= 1) return
  const img = e.currentTarget as HTMLElement
  img.setPointerCapture(e.pointerId)
  dragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  baseTx = tx.value
  baseTy = ty.value
}

function onDragMove(e: PointerEvent) {
  if (!dragging.value) return
  tx.value = baseTx + (e.clientX - dragStartX)
  ty.value = baseTy + (e.clientY - dragStartY)
}

function onDragEnd(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const img = e.currentTarget as HTMLElement
  if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId)
}

/** 双击：适应窗口 ↔ 原始尺寸 */
function onImgDblClick(e: MouseEvent) {
  const img = e.currentTarget as HTMLImageElement
  if (zoom.value > 1) {
    zoom.value = 1
    tx.value = 0
    ty.value = 0
    return
  }
  const fitWidth = img.getBoundingClientRect().width / zoom.value
  if (img.naturalWidth > 0 && fitWidth > 0) {
    const target = Math.min(ZOOM_MAX, img.naturalWidth / fitWidth)
    if (target > 1) {
      zoom.value = target
      tx.value = 0
      ty.value = 0
    }
  }
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) closeViewer()
}

async function openAttachment(path: string) {
  const err = await openLocalPath(path)
  if (err) showToast(err)
}

const waOpen = ref(false)
const tlOpen = ref(false)
const baOpen = ref(false)
const taOpen = ref(false)
const webItems = computed<WebActivityItem[]>(() => props.message.webActivity ?? [])
const browseItems = computed<BrowseActivityItem[]>(() => props.message.browseActivity ?? [])
const toolItems = computed<ToolActivityItem[]>(() => props.message.toolActivity ?? [])

/** 思考过程框贴底滚动：增量到达即跟到最新一行 */
const thinkingEl = ref<HTMLElement | null>(null)
watch(
  () => props.thinking,
  () => {
    nextTick(() => {
      const el = thinkingEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

const webSummary = computed(() => {
  const search = webItems.value.filter((i) => i.tool === 'web_search').length
  const fetch = webItems.value.filter((i) => i.tool === 'fetch_webpage').length
  const parts: string[] = []
  if (search) parts.push(t('chat.webSearchCount', { n: search }))
  if (fetch) parts.push(t('chat.webFetchCount', { n: fetch }))
  if (!parts.length) return t('chat.webActivity')
  return `${t('chat.webActivity')} · ${parts.join(t('chat.webActivityJoin'))}`
})

function webHost(url?: string) {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 展开态单条记录的描述：搜索=关键词+来源站点，抓取=URL+页面标题 */
function webItemText(item: WebActivityItem) {
  if (item.tool === 'web_search') {
    const base = `${t('chat.webActivitySearch')}${item.query ?? ''}`
    return item.sites?.length ? `${base} · ${item.sites.join(' / ')}` : base
  }
  return `${webHost(item.url)}${item.title ? ` — ${item.title}` : ''}`
}

function webItemFail(item: WebActivityItem) {
  return item.ok === false ? item.error || t('chat.webActivityFail') : ''
}

const browseSummary = computed(() =>
  `${t('chat.browserActivity')} · ${t('chat.browserOpCount', { n: browseItems.value.length })}`)

const BROWSE_TOOL_KEYS: Record<string, string> = {
  browser_open: 'chat.browserToolOpen',
  browser_click: 'chat.browserToolClick',
  browser_type: 'chat.browserToolType',
  browser_select: 'chat.browserToolSelect',
  browser_scroll: 'chat.browserToolScroll',
  browser_screenshot: 'chat.browserToolShot',
  browser_snapshot: 'chat.browserToolSnapshot',
  browser_back: 'chat.browserToolBack',
  browser_close: 'chat.browserToolClose',
  browser_current: 'chat.browserToolCurrent',
  browser_refresh: 'chat.browserToolRefresh',
  browser_tabs: 'chat.browserToolTabs',
  browser_select_tab: 'chat.browserToolSelectTab',
}

function browseToolLabel(tool: string) {
  const key = BROWSE_TOOL_KEYS[tool]
  return key ? t(key) : tool
}

/** 展开态单条浏览记录的描述：打开=网址+标题，点击/输入/选择=元素编号，滚动=方向 */
function browseItemText(item: BrowseActivityItem) {
  switch (item.tool) {
    case 'browser_open':
    case 'browser_current': {
      const host = webHost(item.url)
      return item.title ? `${host} — ${item.title}` : host
    }
    case 'browser_scroll':
      return item.direction === 'up' ? t('chat.scrollUp') : t('chat.scrollDown')
    case 'browser_click':
    case 'browser_type':
    case 'browser_select':
    case 'browser_snapshot':
      return item.ref ?? ''
    default:
      return ''
  }
}

function openShot(item: BrowseActivityItem) {
  if (item.screenshot) viewImage(item.screenshot)
}

const toolSummary = computed(() =>
  `${t('chat.toolActivity')} · ${t('chat.toolCallCount', { n: toolItems.value.length })}`)

const TOOL_LABEL_KEYS: Record<string, string> = {
  read_file: 'chat.toolReadFile',
  write_file: 'chat.toolWriteFile',
  edit_file: 'chat.toolEditFile',
  list_files: 'chat.toolListFiles',
  grep_files: 'chat.toolGrepFiles',
  glob_files: 'chat.toolGlobFiles',
  execute: 'chat.toolExecute',
  view_image: 'chat.toolViewImage',
  generate_image: 'chat.toolGenerateImage',
  schedule_task: 'chat.toolScheduleTask',
  list_scheduled_tasks: 'chat.toolListTasks',
  update_scheduled_task: 'chat.toolUpdateTask',
  cancel_scheduled_task: 'chat.toolCancelTask',
  list_skills: 'chat.toolListSkills',
  install_skill: 'chat.toolInstallSkill',
  delegate: 'chat.toolDelegate',
  create_team: 'chat.toolCreateTeam',
  add_member: 'chat.toolAddMember',
  list_team: 'chat.toolListTeam',
  finish: 'chat.toolFinish',
  recordToMemory: 'chat.toolRecordMemory',
  retrieveFromMemory: 'chat.toolRetrieveMemory',
  computer_screenshot: 'chat.computerToolShot',
  computer_click: 'chat.computerToolClick',
  computer_key: 'chat.computerToolKey',
  computer_type: 'chat.computerToolType',
  ask_user: 'chat.toolAskUser',
}

function toolLabel(tool: string) {
  const key = TOOL_LABEL_KEYS[tool]
  return key ? t(key) : tool
}

async function openToolPath(path: string) {
  const err = await openLocalPath(path)
  if (err) showToast(err)
}

</script>

<template>
  <div class="message-bubble" :class="{ self }">
    <Avatar
      :name="senderName"
      :avatar="senderAvatar"
      :size="36"
      :class="{ clickable: mentionable }"
      @click.stop="mentionable && emit('avatarClick')"
      @contextmenu.stop.prevent="mentionable && emit('avatarMenu', $event)"
    />
    <div class="bubble-col">
      <div class="bubble-info">
        <span v-if="showName && senderName" class="sender-name">{{ senderName }}</span>
        <span v-if="badge" class="badge">{{ badge }}</span>
      </div>
      <div v-if="message.thinking" class="thinking-log">
        <button class="tl-toggle" type="button" @click="tlOpen = !tlOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.7 10.7c-.7.5-.7 1.4-.7 2.3h-6c0-.9 0-1.8-.7-2.3A6 6 0 0 1 12 3z" />
          </svg>
          <span class="tl-label">{{ t('chat.thinkingProcess') }}</span>
          <svg class="tl-caret" :class="{ open: tlOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <pre v-if="tlOpen" class="tl-text">{{ message.thinking }}</pre>
      </div>
      <div
        class="bubble"
        :class="{ error: message.type === 'error' }"
        @contextmenu.prevent="emit('bubbleMenu', $event)"
      >
        <div v-if="message.attachments?.length" class="attachments">
          <template v-for="att in message.attachments" :key="att.path">
            <img
              v-if="att.type === 'image'"
              class="attachment-image"
              :src="fsContentUrl(att.path)"
              :title="att.path"
              alt=""
              @click="viewImage(att.path)"
            />
            <span v-else class="attachment clickable" :title="`${att.path}${t('common.openClick')}`" @click="openAttachment(att.path)">
              <svg v-if="att.type === 'dir'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
              </svg>
              <span class="att-name">{{ att.name }}</span>
            </span>
          </template>
        </div>
        <div v-if="thinking" ref="thinkingEl" class="thinking-stream">{{ thinking }}</div>
        <div v-if="typing && !message.content" class="typing">
          <span></span><span></span><span></span>
        </div>
        <span v-else-if="self || message.type === 'error'" class="plain">{{ message.content }}</span>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="md" v-html="rendered"></div>
      </div>
      <div v-if="webItems.length" class="web-activity">
        <button class="wa-toggle" type="button" @click="waOpen = !waOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" />
          </svg>
          <span class="wa-summary">{{ webSummary }}</span>
          <svg class="wa-caret" :class="{ open: waOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <ul v-if="waOpen" class="wa-list">
          <li v-for="(item, idx) in webItems" :key="idx" :class="{ fail: item.ok === false }">
            <span class="wa-kind">{{ item.tool === 'web_search' ? t('chat.webActivitySearch') : t('chat.webActivityFetch') }}</span>
            <span class="wa-text">
              <a v-if="item.tool === 'fetch_webpage' && item.url" :href="item.url" target="_blank" rel="noopener">{{ webItemText(item) }}</a>
              <template v-else>{{ webItemText(item) }}</template>
            </span>
            <span v-if="webItemFail(item)" class="wa-err">{{ webItemFail(item) }}</span>
          </li>
        </ul>
      </div>
      <div v-if="browseItems.length" class="web-activity">
        <button class="wa-toggle" type="button" @click="baOpen = !baOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M3 8h18M8 21h8" />
          </svg>
          <span class="wa-summary">{{ browseSummary }}</span>
          <svg class="wa-caret" :class="{ open: baOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <ul v-if="baOpen" class="wa-list">
          <li v-for="(item, idx) in browseItems" :key="idx" :class="{ fail: item.ok === false }">
            <span class="wa-kind">{{ browseToolLabel(item.tool) }}</span>
            <span class="wa-text">{{ browseItemText(item) }}</span>
            <img
              v-if="item.screenshot"
              class="ba-shot"
              :src="fsContentUrl(item.screenshot)"
              :title="t('chat.viewShot')"
              alt=""
              @click="openShot(item)"
            />
            <span v-if="item.ok === false" class="wa-err">{{ item.error || t('chat.webActivityFail') }}</span>
          </li>
        </ul>
      </div>
      <div v-if="toolItems.length" class="web-activity">
        <button class="wa-toggle" type="button" @click="taOpen = !taOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L15 12l-3-3 2.7-2.7z" />
          </svg>
          <span class="wa-summary">{{ toolSummary }}</span>
          <svg class="wa-caret" :class="{ open: taOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <ul v-if="taOpen" class="wa-list">
          <li v-for="(item, idx) in toolItems" :key="idx" :class="{ fail: item.ok === false }">
            <span class="wa-kind">{{ toolLabel(item.tool) }}</span>
            <a
              v-if="item.openPath"
              class="wa-text link"
              :title="`${item.target}（${t('chat.toolOpenHint')}）`"
              @click.prevent="openToolPath(item.openPath)"
            >{{ item.target }}</a>
            <span v-else-if="item.target" class="wa-text" :title="item.target">{{ item.target }}</span>
            <span v-if="item.ok === false" class="wa-err">{{ t('chat.toolCallFail') }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="viewerSrc" ref="viewerEl" class="img-viewer" @click="onOverlayClick" @wheel.prevent="onWheel">
      <img
        :src="viewerSrc"
        alt=""
        :class="{ grabbing: dragging, grabbable: zoom > 1 && !dragging }"
        :style="{ transform: `translate(${tx}px, ${ty}px) scale(${zoom})` }"
        draggable="false"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
        @dblclick.prevent="onImgDblClick"
      />
      <button class="viewer-close" :title="t('common.close')" @click.stop="closeViewer">×</button>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.message-bubble {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  max-width: 70%;

  &.self {
    flex-direction: row-reverse;
    align-self: flex-end;

    .bubble {
      align-self: flex-end;
      background: $bg-bubble-self;
      color: $text-white;
      border-radius: $radius-md 2px $radius-md $radius-md;
    }
  }

  .clickable {
    cursor: pointer;
  }
}

.bubble-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  .badge {
    align-self: flex-start;
    width: fit-content;
    font-size: $font-size-xs;
    line-height: 1;
    padding: 3px 7px;
    border-radius: $radius-sm;
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.08);
  }
}

.self .bubble-col .badge {
  align-self: flex-end;
}

.thinking-log {
  .tl-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-sm;
    background: rgba(0, 0, 0, 0.22);
    color: $text-tertiary;
    font-size: $font-size-xs;
    line-height: 1.2;
    cursor: pointer;
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      background: rgba(0, 0, 0, 0.35);
      color: $text-secondary;
    }

    svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }

    .tl-label {
      white-space: nowrap;
    }

    .tl-caret {
      transition: transform $transition-fast;

      &.open {
        transform: rotate(180deg);
      }
    }
  }

  .tl-text {
    margin: 4px 0 0;
    padding: 6px 10px;
    max-height: 220px;
    overflow-y: auto;
    max-width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-sm;
    background: rgba(0, 0, 0, 0.22);
    font-family: inherit;
    font-size: $font-size-xs;
    line-height: 1.6;
    color: $text-secondary;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.web-activity {
  .wa-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-sm;
    background: rgba(0, 0, 0, 0.22);
    color: $text-tertiary;
    font-size: $font-size-xs;
    line-height: 1.2;
    cursor: pointer;
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      background: rgba(0, 0, 0, 0.35);
      color: $text-secondary;
    }

    svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }

    .wa-summary {
      white-space: nowrap;
    }

    .wa-caret {
      transition: transform $transition-fast;

      &.open {
        transform: rotate(180deg);
      }
    }
  }

  .wa-list {
    margin: 4px 0 0;
    padding: 6px 10px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-sm;
    background: rgba(0, 0, 0, 0.22);

    li {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: $font-size-xs;
      line-height: 1.5;
      color: $text-secondary;
      min-width: 0;

      &.fail {
        color: #ff9c9c;
      }

      .wa-kind {
        flex-shrink: 0;
        color: $text-tertiary;
      }

      .wa-text {
        min-width: 0;
        word-break: break-all;

        &.link {
          color: $primary-color;
          cursor: pointer;

          &:hover {
            text-decoration: underline;
          }
        }

        a {
          color: $primary-color;

          &:hover {
            text-decoration: underline;
          }
        }
      }

      .wa-err {
        min-width: 0;
        word-break: break-all;
        color: #ff9c9c;
      }

      .ba-shot {
        flex-shrink: 0;
        align-self: center;
        width: 64px;
        height: 36px;
        object-fit: cover;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        cursor: zoom-in;
        background: rgba(0, 0, 0, 0.3);

        &:hover {
          border-color: rgba(255, 255, 255, 0.3);
        }
      }
    }
  }
}

.bubble-info {
  margin-bottom: 4px;
}

.sender-name {
  align-self: flex-start;
  max-width: 100%;
  font-size: $font-size-xs;
  color: $text-tertiary;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.self .sender-name {
  align-self: flex-end;
}

.bubble {
  /* 贴内容宽度而非拉伸占满列：发送者标签（长 openid 不换行）会把列撑宽，短消息不该跟着变宽 */
  align-self: flex-start;
  max-width: 100%;
  padding: 10px $spacing-md;
  background: $bg-bubble-other;
  color: $text-primary;
  border-radius: 2px $radius-md $radius-md $radius-md;
  font-size: $font-size-base;
  line-height: 1.5;
  word-break: break-word;

  &.error {
    background: rgba(250, 81, 81, 0.12);
    border: 1px solid rgba(250, 81, 81, 0.35);
    color: #ff9c9c;
  }

  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .attachment-image {
    display: block;
    max-width: 200px;
    max-height: 200px;
    border-radius: $radius-sm;
    border: 1px solid rgba(255, 255, 255, 0.12);
    cursor: zoom-in;
    background: rgba(0, 0, 0, 0.3);

    .self & {
      border-color: rgba(255, 255, 255, 0.25);
    }
  }

  .attachment {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 220px;
    padding: 4px 9px;
    border-radius: $radius-sm;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.12);
    cursor: default;

    &.clickable {
      cursor: pointer;
      transition: background $transition-fast, border-color $transition-fast;

      &:hover {
        background: rgba(0, 0, 0, 0.4);
        border-color: rgba(255, 255, 255, 0.25);
      }
    }

    svg {
      width: 14px;
      height: 14px;
      color: #fbbc54;
      flex-shrink: 0;
    }

    .att-name {
      font-size: $font-size-sm;
      color: $text-primary;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .plain {
    white-space: pre-wrap;
  }

  .md {
    :deep(p) {
      margin: 0.5em 0;
    }

    :deep(> p:first-child) {
      margin-top: 0;
    }

    :deep(> p:last-child) {
      margin-bottom: 0;
    }

    $headings: (h1, h2, h3, h4, h5, h6);
    @each $h in $headings {
      :deep(#{$h}) {
        margin: 0.6em 0 0.3em;
        font-size: $font-size-base;
        font-weight: 600;
        line-height: 1.4;
      }

      :deep(#{$h}:first-child) {
        margin-top: 0;
      }
    }

    :deep(h1) {
      font-size: 1.15em;
    }

    :deep(h2) {
      font-size: 1.1em;
    }

    :deep(h3) {
      font-size: 1.05em;
    }

    :deep(ul) {
      margin: 0.3em 0;
      padding-left: 1.4em;
    }

    :deep(ol) {
      margin: 0.3em 0;
      padding-left: 1.4em;
    }

    :deep(li) {
      margin: 0.15em 0;
    }

    :deep(li > p) {
      margin: 0;
    }

    :deep(code) {
      padding: 1px 5px;
      border-radius: $radius-sm;
      background: rgba(255, 255, 255, 0.1);
      font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
      font-size: 0.9em;
    }

    :deep(pre) {
      margin: 0.5em 0;
      padding: $spacing-md;
      border-radius: $radius-sm;
      background: rgba(0, 0, 0, 0.35);
      overflow-x: auto;
    }

    :deep(pre code) {
      padding: 0;
      background: none;
      font-size: 0.88em;
      line-height: 1.6;
    }

    :deep(blockquote) {
      margin: 0.4em 0;
      padding: 0.1em 0.8em;
      border-left: 3px solid rgba(255, 255, 255, 0.2);
      color: $text-secondary;
    }

    :deep(blockquote p) {
      margin: 0.2em 0;
    }

    :deep(a) {
      color: $primary-color;
    }

    :deep(a:hover) {
      text-decoration: underline;
    }

    :deep(table) {
      margin: 0.5em 0;
      border-collapse: collapse;
      display: block;
      max-width: 100%;
      overflow-x: auto;
    }

    :deep(th) {
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 4px 10px;
      text-align: left;
      background: rgba(255, 255, 255, 0.06);
    }

    :deep(td) {
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 4px 10px;
      text-align: left;
    }

    :deep(hr) {
      margin: 0.6em 0;
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }

    :deep(img) {
      max-width: 100%;
      border-radius: $radius-sm;
    }
  }
}

.thinking-stream {
  max-height: 140px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: $font-size-sm;
  line-height: 1.55;
  color: $text-tertiary;
  padding: 2px 0 6px;
  margin-bottom: 4px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
}

.typing {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 3px 0;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $text-tertiary;
    animation: typing-blink 1.2s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typing-blink {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.img-viewer {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.78);
  overflow: hidden;

  img {
    max-width: 66vw;
    max-height: 66vh;
    user-select: none;

    &.grabbable {
      cursor: grab;
    }

    &.grabbing {
      cursor: grabbing;
    }
  }

  .viewer-close {
    position: fixed;
    top: 14px;
    right: 20px;
    border: none;
    background: rgba(0, 0, 0, 0.4);
    color: #fff;
    font-size: 22px;
    line-height: 1;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    cursor: pointer;

    &:hover {
      background: rgba(0, 0, 0, 0.65);
    }
  }
}

</style>
