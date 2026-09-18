import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Conversation } from '@/types'
import { deleteConversation, listArchivedConversations, restoreConversation } from '@/api/conversation'
import { useConversationStore } from '@/stores/conversation'

/** 历史会话（已归档）：按归档时间倒序，支持按智能体过滤 */
export const useHistoryStore = defineStore('history', () => {
  const conversationStore = useConversationStore()

  const archived = ref<Conversation[]>([])
  const loading = ref(false)

  async function loadArchived(agentId?: string) {
    loading.value = true
    try {
      archived.value = await listArchivedConversations(agentId)
    } finally {
      loading.value = false
    }
  }

  /** 物理删除历史会话 */
  async function deleteArchived(id: string) {
    await deleteConversation(id)
    archived.value = archived.value.filter((c) => c.id !== id)
  }

  /** 恢复到消息列表：返回恢复后的会话（单聊冲突时原活跃会话自动入历史） */
  async function restore(id: string): Promise<Conversation> {
    const conv = await restoreConversation(id)
    archived.value = archived.value.filter((c) => c.id !== id)
    await conversationStore.loadConversations()
    return conv
  }

  return { archived, loading, loadArchived, deleteArchived, restore }
})
