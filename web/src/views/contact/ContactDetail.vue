<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import { useSkillStore } from '@/stores/skill'
import { confirmAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ id: string }>()

const router = useRouter()
const agentStore = useAgentStore()
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()
const skillStore = useSkillStore()

const agent = computed(() => agentStore.getById(props.id))

const rootRef = ref<HTMLElement | null>(null)
const promptRef = ref<HTMLElement | null>(null)

// 列表切换智能体时组件被路由复用（仅参数变化），详情与角色设定内部滚动位置需归零
watch(
  () => props.id,
  () => {
    rootRef.value?.scrollTo({ top: 0 })
    promptRef.value?.scrollTo({ top: 0 })
  },
)

// 技能详情卡可直接查看/跳转：技能列表按需拉一次（已加载则跳过）
onMounted(() => {
  if (skillStore.skills.length === 0) skillStore.loadSkills().catch(() => {})
})

const agentSkills = computed(() =>
  (agent.value?.skillIds ?? [])
    .map((id) => skillStore.findById(id))
    .filter((s): s is NonNullable<typeof s> => !!s),
)

const metaRows = computed(() => {
  if (!agent.value) return []
  const preset = agent.value.presetId ? presetStore.findById(agent.value.presetId) : undefined
  return [
    { label: t('contact.presetLabel'), value: preset ? preset.name : t('contact.noPresetChat') },
    { label: t('contact.apiLabel'), value: preset ? preset.baseUrl : t('contact.notSet') },
    { label: t('contact.keyLabel'), value: preset?.hasKey ? t('contact.keyConfigured') : t('contact.keyMissing') },
    { label: t('contact.tempLabel'), value: String(agent.value.temperature) },
  ]
})

async function startChat() {
  if (!agent.value) return
  const conversationId = await conversationStore.openConversationWith(agent.value.id)
  router.push(`/chat/${conversationId}`)
}

async function remove() {
  if (!agent.value) return
  const ok = await confirmAction({
    title: t('contact.deleteWarn'),
    message: t('contact.deleteMsg', { name: agent.value.name }),
    confirmText: t('contact.deleteOk'),
    danger: true,
  })
  if (!ok) return
  await agentStore.removeAgent(agent.value.id)
  await conversationStore.handleAgentRemoved()
  router.push('/contact')
}
</script>

<template>
  <div ref="rootRef" class="contact-detail">
    <template v-if="agent">
      <div class="profile-card">
        <div class="profile-header drag-region">
          <Avatar :name="agent.name" :avatar="agent.avatar" :size="64" />
          <div class="profile-title">
            <h2 class="name">
              {{ agent.name }}
              <span v-if="agent.isOrchestrator" class="orch-chip">{{ t('common.orchestrator') }}</span>
            </h2>
            <p class="desc">{{ agent.description || t('contact.noDesc') }}</p>
          </div>
        </div>

        <div class="meta-list">
          <div v-for="row in metaRows" :key="row.label" class="meta-row">
            <span class="label">{{ row.label }}</span>
            <span class="value" :class="{ warn: row.value === t('contact.keyMissing') }">{{ row.value }}</span>
          </div>
          <div class="meta-row column">
            <span class="label">{{ t('contact.promptLabel') }}</span>
            <p ref="promptRef" class="prompt">{{ agent.systemPrompt || t('contact.noPrompt') }}</p>
          </div>
          <div class="meta-row column">
            <span class="label">{{ t('contact.skillsLabel') }}</span>
            <div v-if="agentSkills.length" class="skill-links">
              <router-link v-for="s in agentSkills" :key="s.skillId" :to="`/skills/${s.skillId}`" class="skill-link-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span class="chip-text">{{ s.name }}</span>
                <span v-if="s.global" class="chip-global">{{ t('skills.globalChip') }}</span>
              </router-link>
            </div>
            <span v-else class="value muted">{{ t('contact.noSkills') }}</span>
          </div>
        </div>

        <div class="actions">
          <button class="action-btn primary" @click="startChat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {{ t('contact.startChat') }}
          </button>
          <button class="action-btn" @click="router.push({ path: '/history', query: { agentId: agent.id } })">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3.5 7.5" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l3.5 2" />
            </svg>
            {{ t('contact.history') }}
          </button>
          <button class="action-btn" @click="router.push(`/contact/${agent.id}/edit`)">{{ t('common.edit') }}</button>
          <button class="action-btn danger" @click="remove">{{ t('common.delete') }}</button>
        </div>
      </div>
    </template>
    <div v-else class="not-found">{{ t('contact.notFound') }}</div>
  </div>
</template>

<style scoped lang="scss">
.contact-detail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.profile-card {
  width: 520px;
  align-self: flex-start;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: $spacing-lg;
  padding-bottom: $spacing-lg;
  border-bottom: 1px solid $border-color;

  .name {
    font-size: $font-size-xl;
    font-weight: 600;
    color: $text-primary;

    .orch-chip {
      display: inline-block;
      margin-left: 6px;
      font-size: $font-size-xs;
      font-weight: 400;
      line-height: 1;
      padding: 3px 7px;
      border-radius: $radius-sm;
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.4);
      background: rgba(52, 211, 153, 0.08);
      vertical-align: 3px;
    }
  }

  .desc {
    margin-top: $spacing-xs;
    font-size: $font-size-sm;
    color: $text-tertiary;
  }
}

.meta-list {
  padding: $spacing-md 0 $spacing-lg;
}

.meta-row {
  display: flex;
  padding: $spacing-sm 0;
  font-size: $font-size-base;

  .label {
    width: 120px;
    flex-shrink: 0;
    color: $text-tertiary;
  }

  .value {
    color: $text-primary;
    word-break: break-all;

    &.warn {
      color: #fa9d3b;
    }

    &.muted {
      color: $text-tertiary;
    }
  }

  &.column {
    flex-direction: column;
    gap: $spacing-sm;

    .prompt {
      font-size: $font-size-sm;
      color: $text-primary;
      line-height: 1.6;
      white-space: pre-wrap;
      background: $bg-base;
      border-radius: $radius-sm;
      padding: $spacing-md;
      // 角色设定可能很长：限高内部滚动，避免撑开整张详情卡
      max-height: 220px;
      overflow-y: auto;
    }

    .skill-links {
      display: flex;
      flex-wrap: wrap;
      gap: $spacing-sm;
    }

    .skill-link-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px $spacing-sm;
      border-radius: $radius-sm;
      border: 1px solid $border-color;
      background: $bg-input;
      transition: background $transition-fast, border-color $transition-fast;

      svg {
        width: 13px;
        height: 13px;
        color: $primary-color;
        flex-shrink: 0;
      }

      .chip-text {
        font-size: $font-size-xs;
        color: $text-primary;
      }

      .chip-global {
        font-size: $font-size-xs;
        line-height: 1;
        padding: 2px 5px;
        border-radius: $radius-sm;
        color: #34d399;
        border: 1px solid rgba(52, 211, 153, 0.35);
        background: rgba(52, 211, 153, 0.1);
      }

      &:hover {
        background: $bg-hover;
        border-color: rgba(var(--c-primary-rgb), 0.45);

        .chip-text {
          color: $primary-color;
        }
      }
    }
  }
}

.actions {
  border-top: 1px solid $border-color;
  padding-top: $spacing-lg;
  display: flex;
  justify-content: center;
  gap: $spacing-md;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;
  background: $bg-input;
  color: $text-primary;

  svg {
    width: 18px;
    height: 18px;
  }

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
