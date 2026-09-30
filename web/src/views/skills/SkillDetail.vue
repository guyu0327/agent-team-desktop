<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { SkillDetail as SkillDetailModel } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useSkillStore } from '@/stores/skill'
import { alertAction, confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { openLocalPath } from '@/api/desktop'
import Avatar from '@/components/common/Avatar.vue'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/i18n'

const props = defineProps<{ id: string }>()

const router = useRouter()
const agentStore = useAgentStore()
const skillStore = useSkillStore()

const detail = ref<SkillDetailModel | null>(null)
const loading = ref(false)
const scopeBusy = ref(false)

async function load() {
  loading.value = true
  try {
    // 并行刷新技能详情、技能列表与智能体列表：智能体刚装完技能（改了绑定）进来即为最新
    const [d] = await Promise.all([
      skillStore.fetchDetail(props.id),
      skillStore.loadSkills().catch(() => {}),
      agentStore.loadAgents().catch(() => {}),
    ])
    detail.value = d
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)

const pageRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

// 左列表切换技能时组件被路由复用（仅参数变化）。
// 保持旧内容不动，等新数据就绪后在同一帧「换内容 + 滚动归零」，
// 避免清空导致的闪烁，也避免先置顶旧内容再换新的两段式跳变
watch(
  () => props.id,
  async () => {
    await load()
    pageRef.value?.scrollTo({ top: 0 })
    contentRef.value?.scrollTo({ top: 0 })
  },
)

const summary = computed(() => skillStore.findById(props.id))

const isGlobal = computed(() => detail.value?.global ?? summary.value?.global ?? false)

const rendered = computed(() => (detail.value ? renderMarkdown(detail.value.content) : ''))

/** 点击辅助文件：在资源管理器中打开其所在文件夹（顶层文件打开技能目录本身） */
async function revealResource(rel: string) {
  const base = detail.value?.dir?.replace(/[\\/]+$/, '')
  if (!base) return
  const sep = base.includes('\\') ? '\\' : '/'
  const parts = rel.split('/')
  const folder = parts.length > 1 ? base + sep + parts.slice(0, -1).join(sep) : base
  const err = await openLocalPath(folder)
  if (err) showToast(err || t('skills.revealFailed'))
}

/** 打开技能目录本身 */
async function openSkillDir() {
  const dir = detail.value?.dir?.replace(/[\\/]+$/, '')
  if (!dir) return
  const err = await openLocalPath(dir)
  if (err) showToast(err || t('skills.revealFailed'))
}

async function toggleGlobal() {
  if (!detail.value || scopeBusy.value) return
  const next = !isGlobal.value
  scopeBusy.value = true
  try {
    await skillStore.changeScope(props.id, next)
    detail.value = { ...detail.value, global: next }
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('skills.scopeSaveFailed'))
  } finally {
    scopeBusy.value = false
  }
}

/** 勾选/取消某个智能体 = 改它的 skillIds 绑定（与智能体编辑页、install_skill 同一数据源） */
async function toggleAgent(agentId: string) {
  const agent = agentStore.getById(agentId)
  if (!agent || scopeBusy.value) return
  const set = new Set(agent.skillIds ?? [])
  if (set.has(props.id)) set.delete(props.id)
  else set.add(props.id)
  scopeBusy.value = true
  try {
    await agentStore.updateAgentById(agentId, { ...agent, skillIds: [...set] })
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('skills.scopeSaveFailed'))
  } finally {
    scopeBusy.value = false
  }
}

async function remove() {
  const name = summary.value?.name ?? props.id
  const ok = await confirmAction({
    title: t('common.delete'),
    message: t('skills.deleteMsg', { name }),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await skillStore.removeSkill(props.id)
    router.push('/skills')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('skills.deleteFailed'))
  }
}
</script>

<template>
  <div ref="pageRef" class="skill-detail">
    <template v-if="detail">
      <div class="detail-card">
        <div class="detail-header drag-region">
          <span class="skill-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <div class="detail-title">
            <h2 class="name">{{ detail.name }}</h2>
            <p class="desc">{{ detail.description || detail.skillId }}</p>
          </div>
        </div>

        <div class="scope">
          <div class="scope-head">
            <span class="scope-label">{{ t('skills.scopeLabel') }}</span>
            <label class="global-toggle" :class="{ on: isGlobal, busy: scopeBusy }">
              <input type="checkbox" :checked="isGlobal" :disabled="scopeBusy" @change="toggleGlobal" />
              <span class="track"><span class="thumb" /></span>
              <span class="global-text">{{ t('skills.globalAll') }}</span>
            </label>
          </div>
          <template v-if="!isGlobal">
            <div v-if="agentStore.agents.length" class="agent-chips">
              <button
                v-for="a in agentStore.agents"
                :key="a.id"
                type="button"
                class="agent-chip"
                :class="{ checked: (a.skillIds ?? []).includes(props.id) }"
                :disabled="scopeBusy"
                @click="toggleAgent(a.id)"
              >
                <Avatar :name="a.name" :avatar="a.avatar" :size="20" />
                <span class="chip-name">{{ a.name }}</span>
              </button>
            </div>
            <p v-else class="scope-hint">{{ t('skills.noAgents') }}</p>
          </template>
          <p v-else class="scope-hint">{{ t('skills.globalHint') }}</p>
        </div>

        <div class="resources">
          <span class="resources-label">{{ t('skills.resourcesLabel') }}</span>
          <div v-if="detail.resources.length" class="resource-list">
            <button
              v-for="r in detail.resources"
              :key="r"
              type="button"
              class="resource-chip"
              :title="t('skills.revealTip')"
              @click="revealResource(r)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M13 2v7h7" />
              </svg>
              <span class="resource-name">{{ r }}</span>
            </button>
          </div>
          <p v-else class="resources-empty">{{ t('skills.resourcesEmpty') }}</p>
          <button type="button" class="folder-btn" :title="t('skills.revealTip')" @click="openSkillDir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            {{ t('skills.openFolder') }}
          </button>
        </div>

        <div ref="contentRef" class="content" v-html="rendered"></div>

        <div class="actions">
          <button class="action-btn" @click="router.push(`/skills/${detail.skillId}/edit`)">{{ t('common.edit') }}</button>
          <button class="action-btn danger" @click="remove">{{ t('common.delete') }}</button>
        </div>
      </div>
    </template>
    <div v-else-if="!loading" class="not-found">{{ t('skills.notFound') }}</div>
  </div>
</template>

<style scoped lang="scss">
.skill-detail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.detail-card {
  width: 640px;
  align-self: flex-start;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: $spacing-lg;
  padding-bottom: $spacing-lg;
  border-bottom: 1px solid $border-color;

  .skill-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: $radius-md;
    background: rgba(var(--c-primary-rgb), 0.12);
    color: $primary-color;
    flex-shrink: 0;

    svg {
      width: 28px;
      height: 28px;
    }
  }

  .name {
    font-size: $font-size-xl;
    font-weight: 600;
    color: $text-primary;
  }

  .desc {
    margin-top: $spacing-xs;
    font-size: $font-size-sm;
    color: $text-tertiary;
  }
}

.scope {
  padding: $spacing-md 0;
  border-bottom: 1px solid $border-color;

  .scope-head {
    display: flex;
    align-items: center;
    gap: $spacing-md;
  }

  .scope-label {
    font-size: $font-size-xs;
    color: $text-tertiary;
    flex-shrink: 0;
  }

  .global-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;

    &.busy {
      opacity: 0.6;
      pointer-events: none;
    }

    input {
      display: none;
    }

    .track {
      display: inline-flex;
      align-items: center;
      width: 30px;
      height: 16px;
      padding: 2px;
      border-radius: 999px;
      background: $bg-input;
      border: 1px solid $border-color;
      transition: background $transition-fast, border-color $transition-fast;
    }

    .thumb {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: $text-tertiary;
      transition: transform $transition-fast, background $transition-fast;
    }

    &.on .track {
      background: rgba(var(--c-primary-rgb), 0.9);
      border-color: transparent;
    }

    &.on .thumb {
      transform: translateX(14px);
      background: $text-white;
    }

    .global-text {
      font-size: $font-size-xs;
      color: $text-secondary;
    }
  }

  .agent-chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    margin-top: $spacing-md;
  }

  .agent-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px $spacing-sm 3px 4px;
    border-radius: $radius-sm;
    border: 1px solid $border-color;
    background: $bg-input;
    cursor: pointer;
    transition: background $transition-fast, border-color $transition-fast;

    .chip-name {
      font-size: $font-size-xs;
      color: $text-secondary;
    }

    &:hover:not(:disabled) {
      background: $bg-hover;
    }

    &.checked {
      border-color: rgba(var(--c-primary-rgb), 0.55);
      background: rgba(var(--c-primary-rgb), 0.12);

      .chip-name {
        color: $primary-color;
      }
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .scope-hint {
    margin-top: $spacing-sm;
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.resources {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  padding: $spacing-md 0;
  border-bottom: 1px solid $border-color;

  .resources-label {
    font-size: $font-size-xs;
    color: $text-tertiary;
    flex-shrink: 0;
    line-height: 24px;
  }

  .resource-list {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    // 辅助文件多时（GitHub 整仓导入常见）限高内部滚动，不撑开详情卡
    max-height: 84px;
    overflow-y: auto;
  }

  .resources-empty {
    font-size: $font-size-xs;
    color: $text-tertiary;
    line-height: 24px;
  }

  .folder-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: $radius-sm;
    border: 1px solid $border-color;
    background: $bg-input;
    font-size: $font-size-xs;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;
    transition: background $transition-fast, border-color $transition-fast;

    svg {
      width: 13px;
      height: 13px;
    }

    &:hover {
      background: $bg-hover;
      border-color: rgba(var(--c-primary-rgb), 0.45);
      color: $primary-color;
    }
  }

  .resource-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 3px $spacing-sm 3px 5px;
    border-radius: $radius-sm;
    border: 1px solid $border-color;
    background: $bg-input;
    cursor: pointer;
    transition: background $transition-fast, border-color $transition-fast;

    svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      color: $text-tertiary;
    }

    .resource-name {
      font-size: $font-size-xs;
      color: $text-secondary;
      font-family: Consolas, Menlo, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &:hover {
      background: $bg-hover;
      border-color: rgba(var(--c-primary-rgb), 0.45);

      svg,
      .resource-name {
        color: $primary-color;
      }
    }
  }
}

.content {
  border-top: 1px solid $border-color;
  margin-top: $spacing-md;
  padding-top: $spacing-lg;
  font-size: $font-size-base;
  color: $text-primary;
  line-height: 1.7;
  word-break: break-word;
  // 技能正文可能很长：限高内部滚动，避免撑开整张详情卡
  max-height: 55vh;
  overflow-y: auto;
}

.actions {
  margin-top: $spacing-xl;
  border-top: 1px solid $border-color;
  padding-top: $spacing-lg;
  display: flex;
  justify-content: center;
  gap: $spacing-md;
}

.action-btn {
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;
  background: $bg-input;
  color: $text-primary;

  &:hover {
    background: $bg-hover;
  }

  &.danger {
    background: transparent;
    color: #fa5151;
    border: 1px solid rgba(250, 81, 81, 0.4);

    &:hover {
      background: rgba(250, 81, 81, 0.1);
    }
  }
}

.not-found {
  margin: auto;
  color: $text-tertiary;
  font-size: $font-size-sm;
}
</style>
