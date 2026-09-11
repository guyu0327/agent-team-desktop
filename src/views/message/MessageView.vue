<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Conversation } from '@/types'
import { useConversationStore } from '@/stores/conversation'
import { useAgentStore } from '@/stores/agent'
import SearchBar from '@/components/common/SearchBar.vue'
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

function displayOf(c: Conversation): { name: string; avatar: string } {
  if (c.type === 'group') return { name: c.name, avatar: '👥' }
  const agent = c.agentId ? agentStore.getById(c.agentId) : undefined
  return { name: agent?.name ?? '已删除的智能体', avatar: agent?.avatar ?? '' }
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
      <div class="panel-header">
        <SearchBar v-model="keyword" class="search" />
        <button class="icon-btn" title="发起群聊" @click="showGroupModal = true">
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
        <div v-if="filteredConversations.length === 0" class="empty">无匹配的会话</div>
      </div>
    </aside>
    <section class="content-area">
      <router-view />
    </section>

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
</style>
