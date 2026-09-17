<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import type { AgentDraft } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { AVATAR_PRESETS } from '@/mock/seed'
import Avatar from '@/components/common/Avatar.vue'

const props = defineProps<{ id?: string }>()

const router = useRouter()
const agentStore = useAgentStore()
const presetStore = useModelPresetStore()

const isEdit = computed(() => !!props.id)
const existing = props.id ? agentStore.getById(props.id) : undefined

const form = reactive<AgentDraft>({
  name: existing?.name ?? '',
  avatar: existing?.avatar ?? '',
  groupName: existing?.groupName ?? '',
  description: existing?.description ?? '',
  presetId: existing?.presetId ?? '',
  imagePresetId: existing?.imagePresetId ?? '',
  isOrchestrator: existing?.isOrchestrator ?? false,
  systemPrompt: existing?.systemPrompt ?? '',
  temperature: existing?.temperature ?? 0.7,
})

const nameError = computed(() => (form.name.trim() ? '' : '请填写名称'))

const presetOptions = computed(() => presetStore.presets)

const imagePresetOptions = computed(() =>
  presetStore.presets.filter((p) => p.protocol !== 'openai-chat'),
)

const PROTOCOL_LABELS: Record<string, string> = {
  'dashscope-image': 'DashScope',
  'openai-image': 'OpenAI Images',
  'siliconflow-image': '硅基流动',
}

function protocolLabel(protocol: string) {
  return PROTOCOL_LABELS[protocol] ?? protocol
}

const selectedPreset = computed(() =>
  presetOptions.value.find((p) => p.id === form.presetId),
)

const existingGroups = computed(() => [
  ...new Set(
    agentStore.agents
      .map((a) => a.groupName)
      .filter((g): g is string => !!g && g !== existing?.groupName),
  ),
])

function pickAvatar(emoji: string) {
  form.avatar = form.avatar === emoji ? '' : emoji
}

async function save() {
  if (!form.name.trim() || !form.presetId) return
  if (isEdit.value && props.id) {
    await agentStore.updateAgentById(props.id, { ...form })
    router.push(`/contact/${props.id}`)
  } else {
    const agent = await agentStore.addAgent({ ...form })
    router.push(`/contact/${agent.id}`)
  }
}

function cancel() {
  router.back()
}
</script>

<template>
  <div class="agent-form">
    <div class="form-card">
      <h2 class="form-title">{{ isEdit ? '编辑智能体' : '新建智能体' }}</h2>

      <div class="field">
        <label class="label">预览</label>
        <div class="preview">
          <Avatar :name="form.name || '智能体'" :avatar="form.avatar" :size="56" />
        </div>
      </div>

      <div class="field">
        <label class="label">头像（可选预设表情）</label>
        <div class="avatar-preset">
          <button
            v-for="emoji in AVATAR_PRESETS"
            :key="emoji"
            type="button"
            class="emoji-btn"
            :class="{ selected: form.avatar === emoji }"
            @click="pickAvatar(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>

      <div class="field">
        <label class="label required">名称</label>
        <input v-model="form.name" class="input" placeholder="如：翻译助手" />
        <p v-if="nameError" class="error">{{ nameError }}</p>
      </div>

      <div class="field">
        <label class="label">描述</label>
        <input v-model="form.description" class="input" placeholder="一句话描述该智能体的职责" />
      </div>

      <div class="field">
        <label class="label">分组</label>
        <input v-model="form.groupName" class="input" list="group-options" maxlength="20" placeholder="可选，如：工作助手；留空表示不分组" />
        <datalist id="group-options">
          <option v-for="g in existingGroups" :key="g" :value="g" />
        </datalist>
      </div>

      <div class="field">
        <label class="label required">模型预设</label>
        <select v-model="form.presetId" class="input" :disabled="presetOptions.length === 0">
          <option value="" disabled>{{ presetOptions.length === 0 ? '暂无可用预设' : '请选择模型预设' }}</option>
          <option v-for="p in presetOptions" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
        <p v-if="presetOptions.length === 0" class="preset-empty">
          还没有模型预设，
          <router-link to="/models/add" class="link">去「模型」页新增 →</router-link>
        </p>
      </div>

      <template v-if="selectedPreset">
        <div class="field">
          <label class="label">API Base URL（由预设提供）</label>
          <input class="input" :value="selectedPreset.baseUrl" readonly disabled />
        </div>

        <div class="field">
          <label class="label">API Key（由预设提供）</label>
          <input class="input" :value="selectedPreset.hasKey ? '已配置' : '未配置'" readonly disabled />
        </div>
      </template>

      <div class="field">
        <label class="label">图像预设（可选）</label>
        <select v-model="form.imagePresetId" class="input">
          <option value="">不启用文生图</option>
          <option v-for="p in imagePresetOptions" :key="p.id" :value="p.id">
            {{ p.name }}（{{ protocolLabel(p.protocol) }}）
          </option>
        </select>
        <p class="preset-empty">绑定文生图预设后，该智能体获得 generate_image 工具，可在聊天中生成图片</p>
      </div>

      <div class="field">
        <label class="label">角色设定（System Prompt）</label>
        <textarea
          v-model="form.systemPrompt"
          class="input textarea"
          rows="4"
          placeholder="定义该智能体的角色与行为，如：你是资深代码审查员……"
        />
      </div>

      <div class="field">
        <label class="check-row">
          <input v-model="form.isOrchestrator" type="checkbox" />
          <span>
            设为编排者
            <em>聊天时他会协调团队其他智能体分工协作，并给出最终总结</em>
          </span>
        </label>
      </div>

      <div class="field">
        <label class="label">温度（temperature：{{ form.temperature }}）</label>
        <input v-model.number="form.temperature" type="range" min="0" max="2" step="0.1" class="range" />
        <div class="range-hints">
          <span>0 精确</span>
          <span>1 平衡</span>
          <span>2 发散</span>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="cancel">取消</button>
        <button class="btn primary" :disabled="!form.name.trim() || !form.presetId" @click="save">
          {{ isEdit ? '保存' : '创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.agent-form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.form-card {
  width: 520px;
  align-self: flex-start;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.form-title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.field {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.label {
  font-size: $font-size-sm;
  color: $text-secondary;

  &.required::after {
    content: ' *';
    color: #fa5151;
  }
}

.preview {
  padding: $spacing-sm 0;
}

.avatar-preset {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.emoji-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border-radius: $radius-sm;
  background: $bg-input;
  cursor: pointer;
  transition: background $transition-fast, outline-color $transition-fast;
  outline: 2px solid transparent;
  outline-offset: 1px;

  &:hover {
    background: $bg-hover;
  }

  &.selected {
    background: $primary-light;
    outline-color: $primary-color;
  }
}

.input {
  width: 100%;
  padding: 9px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;

  &::placeholder {
    color: $text-tertiary;
  }

  &:focus {
    outline: 1px solid $primary-color;
  }

  &.textarea {
    resize: vertical;
    line-height: 1.5;
  }
}

.range {
  width: 100%;
  accent-color: $primary-color;
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  cursor: pointer;
  font-size: $font-size-sm;
  color: $text-primary;

  input {
    margin-top: 2px;
    accent-color: $primary-color;
    cursor: pointer;
  }

  em {
    display: block;
    margin-top: 2px;
    font-style: normal;
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.preset-empty {
  font-size: $font-size-xs;
  color: $text-tertiary;

  .link {
    color: $primary-color;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}

select.input {
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    color: $text-tertiary;
  }

  option {
    background: $bg-panel;
    color: $text-primary;
  }
}

.range-hints {
  display: flex;
  justify-content: space-between;
  font-size: $font-size-xs;
  color: $text-tertiary;
}

.error {
  font-size: $font-size-xs;
  color: #fa5151;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color;
}

.btn {
  padding: 8px $spacing-xxl;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &.primary {
    background: $primary-color;
    color: $text-white;

    &:hover:not(:disabled) {
      background: $primary-hover;
    }
  }

  &:disabled {
    background: $bg-input;
    color: $text-tertiary;
    cursor: not-allowed;
  }
}
</style>
