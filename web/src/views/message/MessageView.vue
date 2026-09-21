<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Conversation } from '@/types'
import { useConversationStore } from '@/stores/conversation'
import { useAgentStore } from '@/stores/agent'
import { alertAction, confirmAction } from '@/composables/confirm'
import { markRead } from '@/api/conversation'
import { CLAWBOT_AVATAR } from '@/constants/clawbot'
import { t } from '@/i18n'
import SearchBar from '@/components/common/SearchBar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import ConversationItem from './components/ConversationItem.vue'
import GroupChatModal from './components/GroupChatModal.vue'

const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const agentStore = useAgentStore()

const keyword = ref('')
const showGroupModal = ref(false)

function onGroupCreated(conversationId: string) {
  showGroupModal.value = false
  router.push(`/chat/${conversationId}`)
}

// 会话右键菜单
const convCtx = ref<{ x: number; y: number; conv: Conversation } | null>(null)
const renameTarget = ref<Conversation | null>(null)
const renameDraft = ref('')

const convCtxItems = computed(() => {
  const c = convCtx.value?.conv
  if (!c) return []
  const items: { key: string; label: string; danger?: boolean }[] = [
    { key: 'pin', label: c.pinned ? t('chat.unpin') : t('chat.pin') },
  ]
  if (c.unreadCount > 0) items.push({ key: 'read', label: t('message.markRead') })
  if (c.type === 'group') items.push({ key: 'rename', label: t('message.rename') })
  else items.push({ key: 'newChat', label: t('message.newChat') })
  items.push({ key: 'delete', label: c.type === 'group' ? t('message.disband') : t('message.deleteChat'), danger: true })
  return items
})

async function onConvCtxSelect(key: string) {
  const c = convCtx.value?.conv
  if (!c) return
  if (key === 'pin') {
    conversationStore.togglePinned(c.id)
    return
  }
  if (key === 'read') {
    try {
      await markRead(c.id)
      await conversationStore.loadConversations()
    } catch {
      /* 刷新已读状态失败可忽略 */
    }
    return
  }
  if (key === 'rename') {
    renameTarget.value = c
    renameDraft.value = c.name
    return
  }
  if (key === 'newChat') {
    const ok = await confirmAction({
      title: t('message.newChat'),
      message: t('chat.newSessionMsg'),
      confirmText: t('message.newChat'),
    })
    if (!ok) return
    try {
      await conversationStore.archiveConversation(c.id)
      if (c.agentId) {
        const newId = await conversationStore.openConversationWith(c.agentId)
        router.push(`/chat/${newId}`)
      } else {
        router.push('/chat')
      }
    } catch (e) {
      alertAction(e instanceof Error ? e.message : t('common.opFailed'))
    }
    return
  }
  if (key === 'delete') {
    const isGroup = c.type === 'group'
    const ok = await confirmAction({
      title: isGroup ? t('message.disbandTitle') : t('message.deleteTitle'),
      message: isGroup ? t('message.disbandMsg', { name: c.name }) : t('message.deleteMsg'),
      confirmText: isGroup ? t('message.disbandOk') : t('common.delete'),
      danger: true,
    })
    if (ok) conversationStore.archiveConversation(c.id)
  }
}

async function saveRename() {
  const c = renameTarget.value
  renameTarget.value = null
  if (!c) return
  const value = renameDraft.value.trim()
  if (!value || value === c.name) return
  try {
    await conversationStore.renameGroup(c.id, value)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('message.renameFailed'))
  }
}

function displayOf(c: Conversation): { name: string; avatar: string } {
  if (c.channel === 'wechat') return { name: t('chat.wechatBotName'), avatar: CLAWBOT_AVATAR }
  if (c.type === 'group') return { name: c.name, avatar: '👥' }
  const agent = c.agentId ? agentStore.getById(c.agentId) : undefined
  return { name: agent?.name ?? t('message.deletedAgent'), avatar: agent?.avatar ?? '' }
}

const filteredConversations = computed(() => {
  const list = conversationStore.sortedConversations
  const q = keyword.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((c) => {
    const { name } = displayOf(c)
    return name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
  })
})

const activeId = computed(() => (route.name === 'Chat' ? (route.params.id as string) : null))
</script>

<template>
  <div class="message-module">
    <aside class="list-panel">
      <div class="panel-header drag-region">
        <SearchBar v-model="keyword" class="search" />
        <button class="icon-btn" :title="t('message.newGroup')" @click="showGroupModal = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </button>
      </div>
      <div class="conversation-list">
        <router-link
          v-for="c in filteredConversations"
          :key="c.id"
          :to="`/chat/${c.id}`"
          class="conversation-link"
          @contextmenu.prevent="convCtx = { x: $event.clientX, y: $event.clientY, conv: c }"
        >
          <ConversationItem
            :conversation="c"
            :name="displayOf(c).name"
            :avatar="displayOf(c).avatar"
            :active="c.id === activeId"
            :typing="conversationStore.isTyping(c.id)"
            :pinned="!!c.pinned"
          />
        </router-link>
        <div v-if="filteredConversations.length === 0" class="empty">{{ t('message.empty') }}</div>
        <ContextMenu
          v-if="convCtx"
          :x="convCtx.x"
          :y="convCtx.y"
          :items="convCtxItems"
          @select="onConvCtxSelect"
          @close="convCtx = null"
        />
      </div>
    </aside>
    <section class="content-area">
      <router-view />
    </section>

    <div v-if="renameTarget" class="rename-mask" @click.self="renameTarget = null">
      <div class="rename-card">
        <h3 class="rename-title">{{ t('message.renameTitle') }}</h3>
        <input
          v-model="renameDraft"
          class="rename-input"
          maxlength="30"
          autofocus
          @keyup.enter="saveRename"
          @keyup.esc="renameTarget = null"
        />
        <div class="rename-actions">
          <button class="btn" @click="renameTarget = null">{{ t('common.cancel') }}</button>
          <button class="btn primary" @click="saveRename">{{ t('common.save') }}</button>
        </div>
      </div>
    </div>

    <GroupChatModal v-if="showGroupModal" @close="showGroupModal = false" @created="onGroupCreated" />
  </div>
</template>

<style scoped lang="scss">
.message-module {
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

.panel-header {
  display: flex;
  align-items: center;

  .search {
    flex: 1;
    min-width: 0;
  }
}

.icon-btn {
  width: 32px;
  height: 32px;
  margin-right: $spacing-md;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: $bg-panel-hover;
    color: $text-primary;
  }
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: $spacing-sm;

  .conversation-link {
    display: block;
  }

  .empty {
    padding: $spacing-xxl;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-size-sm;
  }
}

.content-area {
  flex: 1;
  min-width: 0;
  background: $bg-content;
  display: flex;
  flex-direction: column;
}

.rename-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.rename-card {
  width: 320px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-lg;
}

.rename-title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: $spacing-md;
}

.rename-input {
  width: 100%;
  padding: 8px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;

  &:focus {
    outline: 1px solid $primary-color;
  }
}

.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
  margin-top: $spacing-lg;
}

.btn {
  padding: 6px $spacing-lg;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }

  &.primary {
    background: $primary-color;
    color: $text-white;

    &:hover {
      background: $primary-hover;
    }
  }
}
</style>
