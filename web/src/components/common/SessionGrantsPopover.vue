<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { FileGrant, OpGrant } from '@/types'
import { listFileGrants, revokeFile } from '@/api/fs'
import { listOpGrants, revokeOpGrant } from '@/api/conversation'
import { alertAction, confirmAction } from '@/composables/confirm'
import { openLocalPath } from '@/api/desktop'
import { showToast } from '@/composables/toast'
import { useOutsideClose } from '@/composables/outsideClose'
import { t } from '@/i18n'

const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ close: [] }>()

const rootEl = ref<HTMLElement>()
const grants = ref<FileGrant[]>([])
const opGrants = ref<OpGrant[]>([])

async function open(grant: FileGrant) {
  const err = await openLocalPath(grant.path)
  if (err) showToast(err)
}

function opName(op: OpGrant): string {
  return t(`grants.op_${op.opType}`)
}

function opTime(op: OpGrant): string {
  const d = new Date(op.grantedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  loadGrants()
  loadOpGrants()
})
useOutsideClose(rootEl, () => emit('close'))

async function loadGrants() {
  try {
    grants.value = await listFileGrants(props.conversationId)
  } catch {
    /* 加载失败不阻塞弹层展示 */
  }
}

async function loadOpGrants() {
  try {
    opGrants.value = await listOpGrants(props.conversationId)
  } catch {
    /* 加载失败不阻塞弹层展示 */
  }
}

async function revoke(grant: FileGrant) {
  const ok = await confirmAction({
    title: t('grants.revokeTitle'),
    message: t('grants.revokeMsg', { name: grant.name }),
    confirmText: t('grants.revokeTitle'),
    danger: true,
  })
  if (!ok) return
  try {
    await revokeFile(props.conversationId, grant.path)
    grants.value = grants.value.filter((g) => g.path !== grant.path)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function revokeOp(op: OpGrant) {
  const ok = await confirmAction({
    title: t('grants.revokeTitle'),
    message: t('grants.revokeToolMsg', { name: opName(op) }),
    confirmText: t('grants.revokeTitle'),
    danger: true,
  })
  if (!ok) return
  try {
    await revokeOpGrant(props.conversationId, op.opType)
    opGrants.value = opGrants.value.filter((g) => g.opType !== op.opType)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}
</script>

<template>
  <div ref="rootEl" class="grants-popover" @click.stop>
    <div class="popover-title">{{ t('grants.title') }}</div>

    <div class="section-label">{{ t('grants.files') }}</div>
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
        <button class="open-btn" :title="t('grants.openTip')" @click="open(grant)">{{ t('common.open') }}</button>
        <button class="revoke" :title="t('grants.revokeTip')" @click="revoke(grant)">✕</button>
      </div>
      <div v-if="grants.length === 0" class="empty">{{ t('grants.filesEmpty') }}</div>
    </div>

    <div class="section-label">{{ t('grants.tools') }}</div>
    <div class="grants-list">
      <div v-for="op in opGrants" :key="op.opType" class="grant-row">
        <svg class="icon tool" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7z" />
        </svg>
        <span class="grant-info">
          <span class="grant-name">{{ opName(op) }}</span>
          <span class="grant-path">{{ t('grants.grantedAt', { time: opTime(op) }) }}</span>
        </span>
        <button class="revoke always" :title="t('grants.revokeTip')" @click="revokeOp(op)">✕</button>
      </div>
      <div v-if="opGrants.length === 0" class="empty">{{ t('grants.toolsEmpty') }}</div>
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

.section-label {
  font-size: $font-size-xs;
  color: $text-secondary;
  font-weight: 600;
  padding: $spacing-xs 0 2px;
}

.grants-list {
  max-height: 150px;
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

    .revoke,
    .open-btn {
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

    &.tool {
      color: #6c9bff;
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

  .open-btn {
    padding: 3px $spacing-md;
    border-radius: $radius-sm;
    background: $bg-input;
    color: $text-secondary;
    font-size: $font-size-xs;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition: all $transition-fast;

    &:hover {
      background: $bg-hover;
      color: $text-primary;
    }
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

    &.always {
      opacity: 0.6;
    }

    &:hover {
      background: rgba(250, 81, 81, 0.15);
      color: #fa5151;
      opacity: 1;
    }
  }
}

.empty {
  padding: $spacing-sm 0;
  font-size: $font-size-xs;
  color: $text-tertiary;
}
</style>
