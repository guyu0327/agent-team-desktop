<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction, confirmAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ id: string }>()

const router = useRouter()
const agentStore = useAgentStore()
const presetStore = useModelPresetStore()

const preset = computed(() => presetStore.findById(props.id))

const PROTOCOL_LABELS = computed<Record<string, string>>(() => ({
  'openai-chat': t('models.protocolChat'),
  'dashscope-image': t('models.protocolDashscope'),
  'openai-image': t('models.protocolOpenaiImage'),
  'siliconflow-image': t('models.protocolSiliconflow'),
}))

const isImage = computed(() => !!preset.value && preset.value.protocol !== 'openai-chat')

const metaRows = computed(() => {
  const p = preset.value
  if (!p) return []
  return [
    { label: t('models.typeLabel'), value: PROTOCOL_LABELS.value[p.protocol] ?? p.protocol, warn: false },
    { label: t('models.apiLabel'), value: p.baseUrl, warn: false },
    { label: t('models.keyLabel'), value: p.hasKey ? t('models.keyConfigured') : t('models.keyMissing'), warn: !p.hasKey },
    { label: t('models.remarkLabel'), value: p.remark || t('contact.notSet'), warn: false },
  ]
})

const usingAgents = computed(() => {
  const p = preset.value
  if (!p) return []
  return agentStore.agents.filter((a) => a.presetId === p.id || a.imagePresetId === p.id)
})

async function remove() {
  const p = preset.value
  if (!p) return
  const ok = await confirmAction({
    title: t('common.delete'),
    message: t('models.deleteMsg', { name: p.name }),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await presetStore.removePreset(p.id)
    router.push('/models')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('models.deleteFailed'))
  }
}
</script>

<template>
  <div class="preset-detail">
    <template v-if="preset">
      <div class="profile-card">
        <div class="profile-header drag-region">
          <span class="preset-icon" :class="{ image: isImage }">
            <svg v-if="!isImage" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </span>
          <div class="profile-title">
            <h2 class="name">
              {{ preset.name }}
              <span class="protocol-chip" :class="{ image: isImage }">{{ isImage ? t('models.imageProto') : t('models.chatProto') }}</span>
            </h2>
            <p class="desc">{{ preset.remark || t('models.noRemark') }}</p>
          </div>
        </div>

        <div class="meta-list">
          <div v-for="row in metaRows" :key="row.label" class="meta-row">
            <span class="label">{{ row.label }}</span>
            <span class="value" :class="{ warn: row.warn }">{{ row.value }}</span>
          </div>

          <div class="usage">
            <template v-if="usingAgents.length > 0">
              <span class="usage-label">{{ t('models.using', { n: usingAgents.length }) }}</span>
              <router-link
                v-for="a in usingAgents"
                :key="a.id"
                :to="`/contact/${a.id}/edit`"
                class="usage-agent"
                :title="`${t('common.edit')} ${a.name}`"
              >
                <Avatar :name="a.name" :avatar="a.avatar" :size="22" />
                <span class="usage-name">{{ a.name }}</span>
              </router-link>
            </template>
            <span v-else class="usage-label">{{ t('models.noUsing') }}</span>
          </div>
        </div>

        <div class="actions">
          <button class="action-btn" @click="router.push(`/models/${preset.id}/edit`)">{{ t('common.edit') }}</button>
          <button class="action-btn danger" @click="remove">{{ t('common.delete') }}</button>
        </div>
      </div>
    </template>
    <div v-else class="not-found">{{ t('models.notFound') }}</div>
  </div>
</template>

<style scoped lang="scss">
.preset-detail {
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

  .preset-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: $radius-md;
    background: $bg-input;
    color: $text-secondary;
    flex-shrink: 0;

    svg {
      width: 28px;
      height: 28px;
    }

    &.image {
      color: $primary-color;
      background: rgba(var(--c-primary-rgb), 0.12);
    }
  }

  .name {
    font-size: $font-size-xl;
    font-weight: 600;
    color: $text-primary;

    .protocol-chip {
      display: inline-block;
      margin-left: 6px;
      font-size: $font-size-xs;
      font-weight: 400;
      line-height: 1;
      padding: 3px 7px;
      border-radius: $radius-sm;
      color: $text-tertiary;
      background: $bg-input;
      vertical-align: 3px;

      &.image {
        color: $primary-color;
        background: rgba(var(--c-primary-rgb), 0.12);
      }
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
  }
}

.usage {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: $spacing-sm;
  margin-top: $spacing-sm;
  padding: $spacing-sm 0;

  .usage-label {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .usage-agent {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px $spacing-sm 2px 2px;
    border-radius: $radius-sm;
    transition: background $transition-fast;

    &:hover {
      background: $bg-hover;

      .usage-name {
        color: $primary-color;
      }
    }

    .usage-name {
      font-size: $font-size-xs;
      color: $text-secondary;
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
