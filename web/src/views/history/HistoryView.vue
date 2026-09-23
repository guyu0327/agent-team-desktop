<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Conversation } from '@/types'
import { useHistoryStore } from '@/stores/history'
import { useAgentStore } from '@/stores/agent'
import { restoreArchivedTask } from '@/api/tasks'
import { confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import SearchBar from '@/components/common/SearchBar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import ConversationItem from '@/views/message/components/ConversationItem.vue'
import { CLAWBOT_AVATAR } from '@/constants/clawbot'
import { dayKeyOf, dayLabelOf } from '@/utils/time'
import { exportConversation } from '@/utils/chatExport'
import { t } from '@/i18n'

const route = useRoute()
const router = useRouter()
const historyStore = useHistoryStore()
const agentStore = useAgentStore()

const keyword = ref('')

/** /history?agentId=xx：从聊天右上角、通讯录进入时按智能体过滤 */
const agentFilter = computed(() => (typeof route.query.agentId === 'string' ? route.query.agentId : ''))

const agentFilterName = computed(() => agentStore.getById(agentFilter.value)?.name ?? '')

onMounted(() => void historyStore.loadArchived())

// agentId 过滤由前端做（与搜索一致）；每次进入入口时重拉，保证刚归档的会话立即可见
watch(agentFilter, (id) => void historyStore.loadArchived(id || undefined))

function displayOf(c: Conversation): { name: string; avatar: string } {
  // 微信归档固定以机器人名义展示（切过智能体后 agentId 已不代表最初处理者）；有好友标识时加后缀区分
  if (c.channel === 'wechat')
    return { name: c.wechatPeer ? `${t('chat.wechatBotName')}-${c.wechatPeer}` : t('chat.wechatBotName'), avatar: CLAWBOT_AVATAR }
  if (c.type === 'group') return { name: c.name, avatar: '👥' }
  // 任务归档以任务名为主标题，头像沿用所属智能体
  if (c.category === 'task') {
    const agent = c.agentId ? agentStore.getById(c.agentId) : undefined
    return { name: c.name || t('history.taskTag'), avatar: agent?.avatar ?? '' }
  }
  const agent = c.agentId ? agentStore.getById(c.agentId) : undefined
  return { name: agent?.name ?? t('common.deletedAgent'), avatar: agent?.avatar ?? '' }
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return historyStore.archived.filter((c) => {
    if (agentFilter.value && !c.memberIds.includes(agentFilter.value)) return false
    if (!q) return true
    const { name } = displayOf(c)
    return name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
  })
})

interface HistoryGroup {
  key: string
  label: string
  items: Conversation[]
}

/** 列表已按归档时间倒序，顺序扫描分组即可 */
const groups = computed<HistoryGroup[]>(() => {
  const out: HistoryGroup[] = []
  for (const c of filtered.value) {
    const ts = c.archivedTime ?? 0
    const key = dayKeyOf(ts)
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.items.push(c)
    } else {
      out.push({ key, label: dayLabelOf(ts), items: [c] })
    }
  }
  return out
})

/** 用户手动切换过折叠的分组（true=折叠 false=展开）；未记录的走默认：仅最上面的分组展开 */
const collapsedState = ref(new Map<string, boolean>())

function isCollapsed(g: HistoryGroup, index: number): boolean {
  // 搜索时全部展开：搜索就是要看到结果，折叠会把命中项藏起来
  if (keyword.value.trim()) return false
  return collapsedState.value.get(g.key) ?? index > 0
}

function toggleGroup(g: HistoryGroup, index: number) {
  collapsedState.value.set(g.key, !isCollapsed(g, index))
}

const activeId = computed(() => (route.name === 'HistoryDetail' ? (route.params.id as string) : null))

function clearAgentFilter() {
  router.push('/history')
}

// 历史会话右键菜单
const ctx = ref<{ x: number; y: number; conv: Conversation } | null>(null)

/** 右键菜单与归档详情页「⋯」一致：导出 + 恢复任务/继续聊天 + 删除，顺序按 不影响数据→更新→删除 */
const ctxItems = computed(() => {
  if (!ctx.value) return []
  // 任务归档可恢复定时任务；普通归档可继续聊天；微信归档不可恢复聊天
  const items: { key: string; label: string; danger?: boolean }[] = [
    { key: 'export', label: t('chat.exportChat') },
  ]
  if (ctx.value.conv.category === 'task') {
    items.push({ key: 'restore-task', label: t('history.restoreTask') })
  } else if (ctx.value.conv.channel !== 'wechat') {
    items.push({ key: 'continue', label: t('history.continueChat') })
  }
  items.push({ key: 'delete', label: t('common.delete'), danger: true })
  return items
})

async function onCtxSelect(key: string) {
  const c = ctx.value?.conv
  if (!c) return
  if (key === 'export') {
    exportConversation(c, 'history')
    return
  }
  if (key === 'restore-task') {
    try {
      const task = await restoreArchivedTask(c.id)
      showToast(t('history.taskRestored'))
      router.push(`/tasks/${task.conversationId}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('history.restoreFailed'))
    }
    return
  }
  if (key === 'continue') {
    try {
      const dto = await historyStore.restore(c.id)
      router.push(`/chat/${dto.id}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('history.restoreFailed'))
    }
    return
  }
  if (key === 'delete') {
    const ok = await confirmAction({
      title: t('history.deleteTitle'),
      message: t('history.deleteMsg'),
      confirmText: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await historyStore.deleteArchived(c.id)
      if (route.params.id === c.id) router.replace('/history')
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('history.deleteFailed'))
    }
  }
}
</script>

<template>
  <div class="history-module">
    <aside class="list-panel">
      <div class="panel-header drag-region">
        <SearchBar v-model="keyword" class="search" />
      </div>
      <div v-if="agentFilter" class="filter-chip-row">
        <span class="filter-chip">
          {{ agentFilterName || t('history.agentFilter') }}
          <button class="chip-x" :title="t('history.clearFilter')" @click="clearAgentFilter">×</button>
        </span>
      </div>
      <div class="history-list">
        <template v-for="(g, gi) in groups" :key="g.key">
          <button class="group-label" @click="toggleGroup(g, gi)">
            <svg
              class="chevron"
              :class="{ collapsed: isCollapsed(g, gi) }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            {{ g.label }}
            <span v-if="isCollapsed(g, gi)" class="group-count">{{ g.items.length }}</span>
          </button>
          <template v-if="!isCollapsed(g, gi)">
            <router-link
              v-for="c in g.items"
              :key="c.id"
              :to="`/history/${c.id}`"
              class="conversation-link"
              @contextmenu.prevent="ctx = { x: $event.clientX, y: $event.clientY, conv: c }"
            >
              <ConversationItem
                :conversation="c"
                :name="displayOf(c).name"
                :avatar="displayOf(c).avatar"
                :badge="c.category === 'task' ? t('history.taskTag') : undefined"
                :active="c.id === activeId"
              />
            </router-link>
          </template>
        </template>
        <div v-if="groups.length === 0" class="empty">
          {{ keyword ? t('history.emptySearch') : t('history.empty') }}
        </div>
        <ContextMenu
          v-if="ctx"
          :x="ctx.x"
          :y="ctx.y"
          :items="ctxItems"
          @select="onCtxSelect"
          @close="ctx = null"
        />
      </div>
    </aside>
    <section class="content-area">
      <router-view />
    </section>
  </div>
</template>

<style scoped lang="scss">
.history-module {
  display: flex;
  height: 100%;
  width: 100%;
}

.list-panel {
  width: $panel-width;
  flex-shrink: 0;
  background: $bg-panel;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-area {
  flex: 1;
  min-width: 0;
  background: $bg-content;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  padding-right: $spacing-md;

  .search {
    flex: 1;
    min-width: 0;
  }
}

.filter-chip-row {
  padding: $spacing-xs $spacing-md $spacing-sm;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px $spacing-md;
  border-radius: 999px;
  background: rgba(var(--c-primary-rgb), 0.15);
  color: $primary-color;
  font-size: $font-size-xs;

  .chip-x {
    border: none;
    background: none;
    color: inherit;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;

    &:hover {
      opacity: 0.75;
    }
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: $spacing-md;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: $spacing-md $spacing-md $spacing-xs;
  border: none;
  background: none;
  font-size: $font-size-xs;
  color: $text-tertiary;
  text-align: left;
  cursor: pointer;
  transition: color $transition-fast;

  &:hover {
    color: $text-secondary;
  }

  .chevron {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    transition: transform $transition-fast;
    transform: rotate(90deg);

    &.collapsed {
      transform: rotate(0deg);
    }
  }

  .group-count {
    margin-left: auto;
    font-size: $font-size-xs;
    color: $text-tertiary;
    opacity: 0.8;
  }
}

.conversation-link {
  display: block;
  text-decoration: none;
}

.empty {
  padding: $spacing-xl $spacing-md;
  font-size: $font-size-sm;
  color: $text-tertiary;
  text-align: center;
}
</style>
