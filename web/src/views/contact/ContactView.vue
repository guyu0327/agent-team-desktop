<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchBar from '@/components/common/SearchBar.vue'
import Avatar from '@/components/common/Avatar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import type { Agent } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import { confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { t } from '@/i18n'

const route = useRoute()
const router = useRouter()
const agentStore = useAgentStore()
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()

const searchQuery = ref('')

const COLLAPSE_KEY = 'contact-collapsed-groups'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

const collapsed = ref<Set<string>>(loadCollapsed())

function toggleGroup(name: string) {
  const next = new Set(collapsed.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  collapsed.value = next
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]))
}

const filteredAgents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return agentStore.agents
  return agentStore.agents.filter((a) => {
    const presetName = a.presetId ? (presetStore.findById(a.presetId)?.name ?? '') : ''
    return (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      presetName.toLowerCase().includes(q)
    )
  })
})

interface AgentGroup {
  name: string
  agents: Agent[]
}

const groups = computed<AgentGroup[]>(() => {
  const named = new Map<string, Agent[]>()
  const ungrouped: Agent[] = []
  for (const a of filteredAgents.value) {
    if (a.groupName) {
      const list = named.get(a.groupName)
      if (list) list.push(a)
      else named.set(a.groupName, [a])
    } else {
      ungrouped.push(a)
    }
  }
  const result: AgentGroup[] = [...named.entries()].map(([name, agents]) => ({ name, agents }))
  if (ungrouped.length > 0) result.push({ name: t('contact.ungrouped'), agents: ungrouped })
  return result
})

const searching = computed(() => searchQuery.value.trim().length > 0)

const activeId = computed(() =>
  route.name === 'ContactDetail' || route.name === 'AgentEdit' ? (route.params.id as string) : null,
)

// 智能体右键菜单
const ctx = ref<{ x: number; y: number; agent: Agent } | null>(null)

const ctxItems = computed(() => [
  { key: 'chat', label: t('contact.chat') },
  { key: 'history', label: t('contact.history') },
  { key: 'edit', label: t('common.edit') },
  { key: 'delete', label: t('common.delete'), danger: true },
])

async function onCtxSelect(key: string) {
  const agent = ctx.value?.agent
  if (!agent) return
  if (key === 'chat') {
    try {
      const conversationId = await conversationStore.openConversationWith(agent.id)
      router.push(`/chat/${conversationId}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('message.openFailed'))
    }
    return
  }
  if (key === 'history') {
    router.push({ path: '/history', query: { agentId: agent.id } })
    return
  }
  if (key === 'edit') {
    router.push(`/contact/${agent.id}/edit`)
    return
  }
  if (key === 'delete') {
    const ok = await confirmAction({
      title: t('contact.deleteWarn'),
      message: t('contact.deleteMsg', { name: agent.name }),
      confirmText: t('contact.deleteOk'),
      danger: true,
    })
    if (!ok) return
    try {
      await agentStore.removeAgent(agent.id)
      await conversationStore.handleAgentRemoved()
      if (route.params.id === agent.id) router.push('/contact')
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('contact.deleteFailed'))
    }
  }
}
</script>

<template>
  <div class="contact-module">
    <aside class="list-panel">
      <SearchBar v-model="searchQuery" :placeholder="t('contact.searchPlaceholder')" />
      <div class="agent-list">
        <router-link :to="`/contact/add`" class="add-link">
          <div class="add-row" :class="{ active: route.name === 'AgentAdd' }">
            <span class="add-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span class="name">{{ t('contact.add') }}</span>
          </div>
        </router-link>

        <div v-for="group in groups" :key="group.name" class="group">
          <button
            type="button"
            class="group-header"
            :title="searching ? t('contact.noCollapseWhileSearch') : undefined"
            @click="!searching && toggleGroup(group.name)"
          >
            <svg class="chevron" :class="{ expanded: searching || !collapsed.has(group.name) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.agents.length }}</span>
          </button>

          <template v-if="searching || !collapsed.has(group.name)">
            <router-link
              v-for="agent in group.agents"
              :key="agent.id"
              :to="`/contact/${agent.id}`"
              class="agent-link"
              @contextmenu.prevent="ctx = { x: $event.clientX, y: $event.clientY, agent }"
            >
              <div class="agent-item" :class="{ active: agent.id === activeId }">
                <Avatar :name="agent.name" :avatar="agent.avatar" :size="36" />
                <div class="agent-info">
                  <span class="name">
                    {{ agent.name }}
                    <span v-if="agent.isOrchestrator" class="orch-chip">{{ t('common.orch') }}</span>
                  </span>
                  <span class="desc">{{ agent.description || (agent.presetId ? presetStore.findById(agent.presetId)?.name : '') || t('common.noPreset') }}</span>
                </div>
              </div>
            </router-link>
          </template>
        </div>

        <div v-if="groups.length === 0" class="empty">{{ t('contact.empty') }}</div>
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
.contact-module {
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

.agent-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: $spacing-sm;
}

.add-link {
  display: block;
  border-bottom: 1px solid $border-light;
  margin-bottom: $spacing-sm;
}

.add-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.active {
    background: $bg-panel-hover;
  }

  .add-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-sm;
    background: $primary-light;
    color: $primary-color;

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .name {
    font-size: $font-size-base;
    color: $text-primary;
  }
}

.group-header {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  width: 100%;
  padding: $spacing-sm $spacing-md;
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  .chevron {
    width: 14px;
    height: 14px;
    color: $text-tertiary;
    transition: transform $transition-fast;
    flex-shrink: 0;

    &.expanded {
      transform: rotate(90deg);
    }
  }

  .group-name {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .group-count {
    font-size: $font-size-xs;
    color: $text-tertiary;
    margin-left: auto;
  }
}

.agent-link {
  display: block;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-md;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.active {
    background: $primary-color;

    .name,
    .desc {
      color: $text-white;
    }

    &:hover {
      background: $primary-color;
    }
  }

  .agent-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-size: $font-size-base;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    .orch-chip {
      display: inline-block;
      margin-left: 4px;
      font-size: 10px;
      line-height: 1;
      padding: 2px 5px;
      border-radius: $radius-sm;
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.4);
      background: rgba(52, 211, 153, 0.08);
      vertical-align: 1px;
    }
  }

  .desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.empty {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
}

.content-area {
  flex: 1;
  min-width: 0;
  background: $bg-content;
  display: flex;
  flex-direction: column;
}
</style>
