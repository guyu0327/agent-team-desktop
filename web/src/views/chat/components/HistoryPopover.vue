<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Conversation } from '@/types'
import { useHistoryStore } from '@/stores/history'
import { useAgentStore } from '@/stores/agent'
import { confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { formatConversationTime } from '@/utils/time'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ agentId: string }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const historyStore = useHistoryStore()
const agentStore = useAgentStore()

const rootEl = ref<HTMLElement>()

onMounted(() => {
  void historyStore.loadArchived(props.agentId)
  setTimeout(() => document.addEventListener('click', onDocClick), 0)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function onDocClick(e: MouseEvent) {
  const target = e.target as Node | null
  if (!rootEl.value || !target) return
  if (rootEl.value.contains(target)) return
  emit('close')
}

const agent = computed(() => agentStore.getById(props.agentId))

/** 右上角入口只看与该智能体的单聊历史 */
const items = computed(() =>
  historyStore.archived.filter((c) => c.type === 'single' && c.memberIds.includes(props.agentId)),
)

function viewRecords(id: string) {
  emit('close')
  router.push(`/history/${id}`)
}

async function continueChat(c: Conversation) {
  emit('close')
  try {
    const dto = await historyStore.restore(c.id)
    router.push(`/chat/${dto.id}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('history.restoreFailed'))
  }
}

async function removeHistory(c: Conversation) {
  const ok = await confirmAction({
    title: t('history.deleteTitle'),
    message: t('history.deleteMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await historyStore.deleteArchived(c.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('history.deleteFailed'))
  }
}

function viewAll() {
  emit('close')
  router.push({ path: '/history', query: { agentId: props.agentId } })
}
</script>

<template>
  <div ref="rootEl" class="history-popover" @click.stop>
    <div class="popover-title">{{ t('history.withAgent', { name: agent?.name ?? t('chat.thisAgent') }) }}</div>
    <div class="list">
      <div v-for="c in items" :key="c.id" class="row" @click="viewRecords(c.id)">
        <Avatar :name="agent?.name ?? '?'" :avatar="agent?.avatar" :size="32" />
        <div class="info">
          <span class="time">{{ t('history.archivedAt', { time: formatConversationTime(c.archivedTime) }) }}</span>
          <span class="last">{{ c.lastMessage || t('history.noText') }}</span>
        </div>
        <div class="ops">
          <button class="op" :title="t('history.restoreTip')" @click.stop="continueChat(c)">{{ t('history.continueChat') }}</button>
          <button class="op danger" :title="t('history.deleteForever')" @click.stop="removeHistory(c)">{{ t('common.delete') }}</button>
        </div>
      </div>
      <div v-if="items.length === 0" class="empty">{{ t('history.empty') }}</div>
    </div>
    <button class="view-all" @click="viewAll">{{ t('history.viewAll') }}</button>
  </div>
</template>

<style scoped lang="scss">
.history-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 44px;
  width: 320px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
  z-index: 50;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}

.popover-title {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-primary;
  padding: $spacing-md $spacing-md $spacing-xs;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 0 $spacing-sm;
}

.row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-sm;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;

    .ops {
      opacity: 1;
    }
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .time {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .last {
    font-size: $font-size-sm;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ops {
    display: flex;
    gap: $spacing-xs;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity $transition-fast;
  }

  .op {
    padding: 3px $spacing-md;
    border-radius: $radius-sm;
    background: $bg-input;
    color: $text-secondary;
    font-size: $font-size-xs;
    cursor: pointer;
    white-space: nowrap;
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      background: $bg-hover;
      color: $text-primary;
    }

    &.danger:hover {
      background: rgba(250, 81, 81, 0.12);
      color: #fa5151;
    }
  }
}

.empty {
  padding: $spacing-lg 0;
  font-size: $font-size-xs;
  color: $text-tertiary;
  text-align: center;
}

.view-all {
  margin: $spacing-xs $spacing-md $spacing-md;
  padding: 6px 0;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  &:hover {
    background: $bg-hover;
    color: $text-primary;
  }
}
</style>
