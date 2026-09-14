<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Attachment, FileGrant, FileListing } from '@/types'
import { listDir, listFileGrants, revokeFile } from '@/api/fs'
import { alertAction, confirmAction } from '@/composables/confirm'
import { isImagePath } from '@/utils/image'

const props = withDefaults(
  defineProps<{
    /** both：可选文件或文件夹；dir：仅文件夹（设置页用） */
    mode?: 'both' | 'dir'
    /** 传入时展示本会话已授权列表并可撤销 */
    conversationId?: string
    title?: string
  }>(),
  { mode: 'both', conversationId: undefined, title: undefined },
)

const emit = defineEmits<{
  select: [attachment: Attachment]
  close: []
}>()

const listing = ref<FileListing | null>(null)
const pathInput = ref('')
const loading = ref(false)
const error = ref('')
const grants = ref<FileGrant[]>([])

onMounted(async () => {
  await open('')
  if (props.conversationId) loadGrants()
})

async function open(path: string) {
  loading.value = true
  error.value = ''
  try {
    listing.value = await listDir(path || undefined)
    pathInput.value = listing.value.path
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取目录失败'
  } finally {
    loading.value = false
  }
}

async function jump() {
  await open(pathInput.value.trim())
}

async function up() {
  if (!listing.value) return
  await open(listing.value.parent ?? '')
}

function openEntry(entry: { directory: boolean; path: string }) {
  if (entry.directory) {
    open(entry.path)
    return
  }
  if (props.mode === 'both') {
    const name = fileNameOf(entry.path)
    select({ path: entry.path, type: isImagePath(name) ? 'image' : 'file', name })
  }
}

/** 把当前所在文件夹作为附件 */
function pickCurrentDir() {
  if (!listing.value || !listing.value.path) return
  select({ path: listing.value.path, type: 'dir', name: listing.value.name })
}

function select(attachment: Attachment) {
  emit('select', attachment)
  emit('close')
}

function fileNameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

function formatSize(n: number): string {
  return n < 1024 ? n + ' B' : n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB'
}

async function loadGrants() {
  if (!props.conversationId) return
  try {
    grants.value = await listFileGrants(props.conversationId)
  } catch {
    /* 授权列表加载失败不阻塞选择器 */
  }
}

async function revoke(grant: FileGrant) {
  if (!props.conversationId) return
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
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h2 class="modal-title">{{ title ?? '选择文件或文件夹' }}</h2>

      <div class="nav-row">
        <button class="nav-btn" :disabled="!listing || !listing.path" title="上一级" @click="up">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <input
          v-model="pathInput"
          class="path-input"
          spellcheck="false"
          placeholder="输入路径后回车跳转，如 D:\Git"
          @keydown.enter.prevent="jump"
        />
        <button class="nav-btn text" @click="jump">跳转</button>
      </div>

      <div class="file-list">
        <div v-if="error" class="state err">{{ error }}</div>
        <div v-else-if="loading" class="state">加载中…</div>
        <template v-else-if="listing">
          <button
            v-for="entry in listing.items"
            :key="entry.path"
            type="button"
            class="file-row"
            :class="{ 'no-pick': mode === 'dir' && !entry.directory }"
            @click="openEntry(entry)"
          >
            <svg v-if="entry.directory" class="icon dir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
            </svg>
            <span class="name">{{ entry.name }}</span>
            <span v-if="!entry.directory && entry.size != null" class="size">{{ formatSize(entry.size) }}</span>
            <span v-if="entry.directory" class="chevron">›</span>
          </button>
          <div v-if="listing.items.length === 0" class="state">（空目录）</div>
          <div v-if="listing.truncated" class="state">条目过多，仅显示前 {{ listing.items.length }} 项，可输入路径直达</div>
        </template>
      </div>

      <div class="footer">
        <button
          v-if="listing?.path"
          class="btn"
          @click="pickCurrentDir"
        >
          选择当前文件夹
        </button>
        <span class="spacer"></span>
        <button class="btn" @click="emit('close')">关闭</button>
      </div>

      <div v-if="conversationId && grants.length > 0" class="grants">
        <div class="grants-title">本会话已授权（智能体可读写）</div>
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
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  width: 560px;
  max-height: 80vh;
  background: $bg-panel;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xl;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.modal-title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.nav-row {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
}

.path-input {
  flex: 1;
  padding: 8px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  font-family: 'JetBrains Mono', Consolas, Menlo, monospace;

  &::placeholder {
    color: $text-tertiary;
    font-family: inherit;
  }

  &:focus {
    outline: 1px solid $primary-color;
  }
}

.nav-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-secondary;
  cursor: pointer;
  flex-shrink: 0;
  transition: background $transition-fast;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover:not(:disabled) {
    background: $bg-hover;
    color: $text-primary;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  &.text {
    width: auto;
    padding: 0 $spacing-md;
    font-size: $font-size-sm;
  }
}

.file-list {
  flex: 1;
  min-height: 260px;
  max-height: 42vh;
  overflow-y: auto;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.state {
  padding: $spacing-lg;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;

  &.err {
    color: #fa5151;
  }
}

.file-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: 7px $spacing-md;
  border-radius: $radius-sm;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;

    .chevron {
      color: $text-secondary;
    }
  }

  .icon {
    width: 18px;
    height: 18px;
    color: $text-secondary;
    flex-shrink: 0;

    &.dir {
      color: #fbbc54;
    }
  }

  .name {
    flex: 1;
    min-width: 0;
    font-size: $font-size-base;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .size {
    font-size: $font-size-xs;
    color: $text-tertiary;
    flex-shrink: 0;
  }

  .chevron {
    color: $text-tertiary;
    font-size: 16px;
    flex-shrink: 0;
  }

  &.no-pick {
    cursor: default;

    &:hover {
      background: transparent;

      .chevron {
        color: $text-tertiary;
      }
    }

    .name {
      color: $text-tertiary;
    }
  }
}

.footer {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color;

  .spacer {
    flex: 1;
  }
}

.btn {
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }
}

.grants {
  border-top: 1px solid $border-color;
  padding-top: $spacing-md;
}

.grants-title {
  font-size: $font-size-xs;
  color: $text-tertiary;
  margin-bottom: $spacing-sm;
}

.grants-list {
  max-height: 140px;
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
</style>
