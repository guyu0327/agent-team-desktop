<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { FileGrant } from '@/types'
import { listFileGrants, revokeFile } from '@/api/fs'
import { alertAction, confirmAction } from '@/composables/confirm'

const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ close: [] }>()

const rootEl = ref<HTMLElement>()
const grants = ref<FileGrant[]>([])

onMounted(() => {
  loadGrants()
  setTimeout(() => document.addEventListener('click', onDocClick), 0)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function onDocClick(e: MouseEvent) {
  const target = e.target as Node | null
  if (!rootEl.value || !target) return
  if (rootEl.value.contains(target)) return
  emit('close')
}

async function loadGrants() {
  try {
    grants.value = await listFileGrants(props.conversationId)
  } catch {
    /* 加载失败不阻塞弹层展示 */
  }
}

async function revoke(grant: FileGrant) {
  const ok = await confirmAction({
    title: '取消授权',
    message: `确定取消「${grant.name}」的读写授权吗？智能体将无法再访问该路径。`,
    confirmText: '取消授权',
    danger: true,
  })
  if (!ok) return
  try {
    await revokeFile(props.conversationId, grant.path)
    grants.value = grants.value.filter((g) => g.path !== grant.path)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <div ref="rootEl" class="grants-popover" @click.stop>
    <div class="popover-title">本会话已授权（智能体可读写）</div>
    <div class="grants-list">
      <div v-for="grant in grants" :key="grant.path" class="grant-row">
        <svg v-if="grant.type === 'dir'" class="icon dir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
        </svg>
        <span class="grant-info" :title="grant.path">
          <span class="grant-name">{{ grant.name }}</span>
          <span class="grant-path">{{ grant.path }}</span>
        </span>
        <button class="revoke" title="取消授权" @click="revoke(grant)">✕</button>
      </div>
      <div v-if="grants.length === 0" class="empty">暂无授权，附加文件或文件夹后自动授权</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.grants-popover {
  position: absolute;
  bottom: calc(100% + $spacing-sm);
  left: $spacing-lg;
  width: 360px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
  padding: $spacing-sm $spacing-md $spacing-md;
  z-index: 60;
}

.popover-title {
  font-size: $font-size-xs;
  color: $text-tertiary;
  padding: $spacing-xs 0 $spacing-sm;
}

.grants-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grant-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: 5px $spacing-sm;
  border-radius: $radius-sm;

  &:hover {
    background: $bg-panel-hover;

    .revoke {
      opacity: 1;
    }
  }

  .icon {
    width: 16px;
    height: 16px;
    color: $text-secondary;
    flex-shrink: 0;

    &.dir {
      color: #fbbc54;
    }
  }

  .grant-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .grant-name {
    font-size: $font-size-sm;
    color: $text-primary;
  }

  .grant-path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .revoke {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: $text-tertiary;
    font-size: 12px;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition: all $transition-fast;

    &:hover {
      background: rgba(250, 81, 81, 0.15);
      color: #fa5151;
    }
  }
}

.empty {
  padding: $spacing-sm 0;
  font-size: $font-size-xs;
  color: $text-tertiary;
}
</style>
