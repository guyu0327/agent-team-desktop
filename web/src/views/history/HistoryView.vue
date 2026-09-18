<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Conversation } from '@/types'
import { useHistoryStore } from '@/stores/history'
import { useAgentStore } from '@/stores/agent'
import { confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import SearchBar from '@/components/common/SearchBar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import ConversationItem from '@/views/message/components/ConversationItem.vue'
import { dayKeyOf, dayLabelOf } from '@/utils/time'
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
  if (c.type === 'group') return { name: c.name, avatar: '👥' }
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

const activeId = computed(() => (route.name === 'HistoryDetail' ? (route.params.id as string) : null))

function clearAgentFilter() {
  router.push('/history')
}

// 历史会话右键菜单
const ctx = ref<{ x: number; y: number; conv: Conversation } | null>(null)

const ctxItems = computed(() => {
  if (!ctx.value) return []
  return [
    { key: 'continue', label: t('history.continueChat') },
    { key: 'delete', label: t('common.delete'), danger: true },
  ]
})

async function onCtxSelect(key: string) {
  const c = ctx.value?.conv
  if (!c) return
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
        <template v-for="g in groups" :key="g.key">
          <div class="group-label">{{ g.label }}</div>
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
              :active="c.id === activeId"
            />
          </router-link>
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
  padding: $spacing-md $spacing-md $spacing-xs;
  font-size: $font-size-xs;
  color: $text-tertiary;
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
