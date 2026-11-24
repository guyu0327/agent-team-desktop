<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AgentDraft } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { useSkillStore } from '@/stores/skill'
import { autoFillAgent } from '@/api/agent'
import { confirmAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'
import { AVATAR_PALETTE, encodeAvatar, hashColor, parseAvatar } from '@/utils/avatar'
import { t } from '@/i18n'

const props = defineProps<{ id?: string }>()

const router = useRouter()
const agentStore = useAgentStore()
const presetStore = useModelPresetStore()
const skillStore = useSkillStore()

onMounted(() => {
  if (skillStore.skills.length === 0) skillStore.loadSkills().catch(() => {})
})

const isEdit = computed(() => !!props.id)
const existing = computed(() => (props.id ? agentStore.getById(props.id) : undefined))

// —— 头像自定义（文字 + 底色）：编辑时从 avatar 字段解析回显，保存时编码写回 ——
// 须先于下方 immediate watch 声明：syncForm→loadAvatar 会引用这些 ref，
// 否则首轮回显触发 TDZ 异常被 watcher 静默吞掉，表单只回显一半（预设/分组/简介全空）
const avatarText = ref('')
const avatarColor = ref<string | undefined>(undefined)

function loadAvatar(value: string | undefined) {
  const s = parseAvatar(value)
  const ts = s?.kind === 'text' ? s : null
  avatarText.value = ts?.text ?? ''
  avatarColor.value = ts?.color
}

const customAvatar = computed(() => encodeAvatar(avatarText.value, avatarColor.value))

const form = reactive<AgentDraft>({
  name: '',
  avatar: '',
  groupName: '',
  description: '',
  presetId: '',
  imagePresetId: '',
  isOrchestrator: false,
  systemPrompt: '',
  temperature: 0.7,
  skillIds: [],
})

// /contact/add 与 /contact/:id/edit 复用同一组件实例，路由切换时需重放表单回显
function syncForm() {
  const e = existing.value
  form.name = e?.name ?? ''
  loadAvatar(e?.avatar)
  form.groupName = e?.groupName ?? ''
  form.description = e?.description ?? ''
  form.presetId = e?.presetId ?? ''
  form.imagePresetId = e?.imagePresetId ?? ''
  form.isOrchestrator = e?.isOrchestrator ?? false
  form.systemPrompt = e?.systemPrompt ?? ''
  form.temperature = e?.temperature ?? 0.7
  form.skillIds = [...(e?.skillIds ?? [])]
}

watch(() => props.id, syncForm, { immediate: true })

// 复用实例/直达链接进编辑页时，agent store 可能晚于表单挂载才就绪，首轮回显拿到空值；
// existing 到位后补一次回放。表单已动过（名称非空）则不回放，避免覆盖编辑中内容
watch(existing, (e) => {
  if (e && !form.name.trim() && !form.groupName.trim() && !form.description.trim()) syncForm()
})

// —— 头像就地编辑：点文字区改文字、点底色区弹取色浮层 ——
const editingText = ref(false)
const draftText = ref('')
const textInput = ref<HTMLInputElement>()
const colorOpen = ref(false)
const editableRoot = ref<HTMLElement>()

// 预览底色/文字与 Avatar 组件同口径：自定义优先，缺省回名称哈希色/首字
const previewBg = computed(() => avatarColor.value || hashColor(form.name || t('agentForm.defaultName')))
const previewText = computed(() => avatarText.value || (form.name || t('agentForm.defaultName')).charAt(0))

function openTextEdit() {
  colorOpen.value = false
  draftText.value = avatarText.value
  editingText.value = true
  nextTick(() => {
    textInput.value?.focus()
    textInput.value?.select()
  })
}

function commitText() {
  if (!editingText.value) return
  avatarText.value = draftText.value.trim()
  editingText.value = false
}

function cancelTextEdit() {
  editingText.value = false
}

function toggleColor() {
  colorOpen.value = !colorOpen.value
}

function onDocPointer(e: PointerEvent) {
  if (!editableRoot.value?.contains(e.target as Node)) colorOpen.value = false
}

watch(colorOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onDocPointer)
  else document.removeEventListener('pointerdown', onDocPointer)
})

onUnmounted(() => document.removeEventListener('pointerdown', onDocPointer))

const nameError = computed(() => (form.name.trim() ? '' : t('agentForm.nameRequired')))

const presetOptions = computed(() => presetStore.presets)

const imagePresetOptions = computed(() =>
  presetStore.presets.filter((p) => p.protocol !== 'openai-chat'),
)

const PROTOCOL_LABELS = computed<Record<string, string>>(() => ({
  'dashscope-image': 'DashScope',
  'openai-image': 'OpenAI Images',
  'siliconflow-image': t('agentForm.siliconflow'),
}))

function protocolLabel(protocol: string) {
  return PROTOCOL_LABELS.value[protocol] ?? protocol
}

const existingGroups = computed(() => [
  ...new Set(
    agentStore.agents
      .map((a) => a.groupName)
      .filter((g): g is string => !!g && g !== existing.value?.groupName),
  ),
])

// 分组输入的自定义建议下拉（替代原生 datalist：系统级下拉无法自定义样式，深色主题下很突兀）
const groupFocus = ref(false)
const groupIndex = ref(0)
const groupSuggestions = computed(() => {
  const q = form.groupName.trim().toLowerCase()
  if (!q) return existingGroups.value
  return existingGroups.value.filter((g) => g.toLowerCase().includes(q))
})

watch([groupSuggestions, groupFocus], () => {
  groupIndex.value = 0
})

function moveGroupSuggestion(delta: number) {
  const n = groupSuggestions.value.length
  if (n === 0) return
  groupIndex.value = (groupIndex.value + delta + n) % n
}

function applyGroupSuggestion() {
  const pick = groupSuggestions.value[groupIndex.value]
  if (groupFocus.value && pick) form.groupName = pick
  groupFocus.value = false
}

function toggleSkill(skillId: string) {
  const set = new Set(form.skillIds)
  if (set.has(skillId)) set.delete(skillId)
  else set.add(skillId)
  form.skillIds = [...set]
}

// —— 一句话自动生成（仅新建页）：生成基础六项，预设与技能仍由用户手动选择 ——
const chatPresets = computed(() => presetStore.presets.filter((p) => p.protocol === 'openai-chat'))

const AUTO_MODEL_KEY = 'agent-autofill-model'

// 名称为主、备注括注，下拉里同名预设靠备注区分
function presetLabel(p: { name: string; remark: string }) {
  return p.remark ? `${p.name}（${p.remark}）` : p.name
}

function imagePresetLabel(p: { name: string; remark: string; protocol: string }) {
  const proto = protocolLabel(p.protocol)
  return p.remark ? `${p.name}（${p.remark} · ${proto}）` : `${p.name}（${proto}）`
}

const autoPrompt = ref('')
const autoPresetId = ref('')
const autoLoading = ref(false)
const autoError = ref('')

watch(
  chatPresets,
  (list) => {
    if (list.some((p) => p.id === autoPresetId.value)) return
    let saved = ''
    try {
      saved = localStorage.getItem(AUTO_MODEL_KEY) ?? ''
    } catch {
      saved = ''
    }
    autoPresetId.value =
      saved && list.some((p) => p.id === saved) ? saved : (list[0]?.id ?? '')
  },
  { immediate: true },
)

async function autoFill() {
  if (autoLoading.value || !autoPrompt.value.trim() || !autoPresetId.value) return
  const hasContent =
    form.name.trim() || form.systemPrompt.trim() || form.description.trim() || form.groupName.trim()
  if (hasContent) {
    const ok = await confirmAction({
      title: t('agentForm.autoTitle'),
      message: t('agentForm.autoOverwrite'),
      confirmText: t('agentForm.autoGenerate'),
    })
    if (!ok) return
  }
  autoLoading.value = true
  autoError.value = ''
  try {
    const draft = await autoFillAgent(autoPrompt.value.trim(), autoPresetId.value)
    form.name = draft.name
    form.groupName = draft.groupName
    form.description = draft.description
    form.systemPrompt = draft.systemPrompt
    form.temperature = draft.temperature ?? 0.7
    try {
      localStorage.setItem(AUTO_MODEL_KEY, autoPresetId.value)
    } catch {
      /* 存储不可用不影响主流程 */
    }
  } catch (e) {
    autoError.value = e instanceof Error ? e.message : t('agentForm.autoFailed')
  } finally {
    autoLoading.value = false
  }
}

async function save() {
  if (!form.name.trim() || !form.presetId) return
  form.avatar = encodeAvatar(avatarText.value, avatarColor.value)
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
      <h2 class="form-title">{{ isEdit ? t('agentForm.editTitle') : t('agentForm.addTitle') }}</h2>

      <div v-if="!isEdit" class="autofill">
        <input
          v-model="autoPrompt"
          class="input"
          :placeholder="t('agentForm.autoPromptPh')"
          @keydown.enter.prevent="autoFill"
        />
        <div class="autofill-row">
          <select v-model="autoPresetId" class="input" :disabled="chatPresets.length === 0">
            <option value="" disabled>{{ t('agentForm.autoModel') }}</option>
            <option v-for="p in chatPresets" :key="p.id" :value="p.id">{{ presetLabel(p) }}</option>
          </select>
          <button
            type="button"
            class="btn primary autofill-btn"
            :disabled="autoLoading || !autoPrompt.trim() || !autoPresetId"
            @click="autoFill"
          >
            ✨ {{ autoLoading ? t('agentForm.autoGenerating') : t('agentForm.autoGenerate') }}
          </button>
        </div>
        <p v-if="chatPresets.length === 0" class="error">{{ t('agentForm.autoNoModel') }}</p>
        <p v-if="autoError" class="error">{{ autoError }}</p>
        <p class="autofill-hint">{{ t('agentForm.autoHint') }}</p>
      </div>

      <div class="field">
        <label class="label">{{ t('agentForm.avatarLabel') }}</label>
        <div ref="editableRoot" class="avatar-editable">
          <div v-if="editingText" class="avatar-box editing" :style="{ background: previewBg }">
            <input
              ref="textInput"
              v-model="draftText"
              class="avatar-text-input"
              maxlength="6"
              :placeholder="previewText"
              @keydown.enter.prevent="commitText"
              @keydown.esc.prevent="cancelTextEdit"
              @blur="commitText"
            />
          </div>
          <template v-else>
            <Avatar :name="form.name || t('agentForm.defaultName')" :avatar="customAvatar" :size="56" />
            <div class="avatar-bg-zone" :title="t('agentForm.avatarColorTitle')" @click="toggleColor"></div>
            <span class="avatar-text-zone" :title="t('agentForm.avatarTextTitle')" @click="openTextEdit"></span>
          </template>
          <div v-if="colorOpen" class="color-pop">
            <button
              type="button"
              class="color-dot auto"
              :class="{ selected: !avatarColor }"
              :title="t('agentForm.avatarColorAuto')"
              @click="avatarColor = undefined"
            ></button>
            <button
              v-for="c in AVATAR_PALETTE"
              :key="c"
              type="button"
              class="color-dot"
              :class="{ selected: avatarColor === c }"
              :style="{ background: c }"
              @click="avatarColor = avatarColor === c ? undefined : c"
            ></button>
          </div>
        </div>
      </div>

      <div class="field">
        <label class="label required">{{ t('agentForm.nameLabel') }}</label>
        <input v-model="form.name" class="input" :placeholder="t('agentForm.namePlaceholder')" />
        <p v-if="nameError" class="error">{{ nameError }}</p>
      </div>

      <div class="field">
        <label class="label">{{ t('agentForm.descLabel') }}</label>
        <input v-model="form.description" class="input" :placeholder="t('agentForm.descPlaceholder')" />
      </div>

      <div class="field">
        <label class="label">{{ t('agentForm.groupLabel') }}</label>
        <div class="group-combo">
          <input
            v-model="form.groupName"
            class="input"
            maxlength="20"
            :placeholder="t('agentForm.groupPlaceholder')"
            autocomplete="off"
            @focus="groupFocus = true"
            @blur="groupFocus = false"
            @keydown.down.prevent="moveGroupSuggestion(1)"
            @keydown.up.prevent="moveGroupSuggestion(-1)"
            @keydown.enter.prevent="applyGroupSuggestion"
            @keydown.esc="groupFocus = false"
          />
          <ul v-if="groupFocus && groupSuggestions.length > 0" class="group-suggestions">
            <li
              v-for="(g, i) in groupSuggestions"
              :key="g"
              :class="{ active: i === groupIndex }"
              @mousedown.prevent="form.groupName = g; groupFocus = false"
              @mouseenter="groupIndex = i"
            >
              {{ g }}
            </li>
          </ul>
        </div>
      </div>

      <div class="field">
        <label class="label required">{{ t('contact.presetLabel') }}</label>
        <select v-model="form.presetId" class="input" :disabled="presetOptions.length === 0">
          <option value="" disabled>{{ presetOptions.length === 0 ? t('agentForm.noPresets') : t('agentForm.pickPreset') }}</option>
          <option v-for="p in presetOptions" :key="p.id" :value="p.id">
            {{ presetLabel(p) }}
          </option>
        </select>
        <p v-if="presetOptions.length === 0" class="preset-empty">
          {{ t('agentForm.noPresetYet') }}
          <router-link to="/models/add" class="link">{{ t('agentForm.goModels') }}</router-link>
        </p>
      </div>

      <div class="field">
        <label class="label">{{ t('agentForm.imagePresetLabel') }}</label>
        <select v-model="form.imagePresetId" class="input">
          <option value="">{{ t('agentForm.noImagePreset') }}</option>
          <option v-for="p in imagePresetOptions" :key="p.id" :value="p.id">
            {{ imagePresetLabel(p) }}
          </option>
        </select>
        <p class="preset-empty">{{ t('agentForm.imagePresetHint') }}</p>
      </div>

      <div class="field">
        <label class="label">{{ t('contact.promptLabel') }}</label>
        <textarea
          v-model="form.systemPrompt"
          class="input textarea"
          rows="4"
          :placeholder="t('agentForm.promptPlaceholder')"
        />
      </div>

      <div class="field">
        <label class="check-row">
          <input v-model="form.isOrchestrator" type="checkbox" />
          <span>
            {{ t('agentForm.setOrchestrator') }}
            <em>{{ t('agentForm.orchestratorHint') }}</em>
          </span>
        </label>
      </div>

      <div class="field">
        <label class="label">{{ t('agentForm.tempLabel', { v: form.temperature }) }}</label>
        <input v-model.number="form.temperature" type="range" min="0" max="2" step="0.1" class="range" />
        <div class="range-hints">
          <span>{{ t('agentForm.tempPrecise') }}</span>
          <span>{{ t('agentForm.tempBalanced') }}</span>
          <span>{{ t('agentForm.tempDivergent') }}</span>
        </div>
      </div>

      <div class="field">
        <label class="label">{{ t('agentForm.skillsLabel') }}</label>
        <p class="preset-empty">{{ t('agentForm.skillsHint') }}</p>
        <div v-if="skillStore.skills.length > 0" class="skill-checks">
          <label
            v-for="s in skillStore.skills"
            :key="s.skillId"
            class="skill-check"
            :title="s.description"
          >
            <input type="checkbox" :checked="form.skillIds.includes(s.skillId)" @change="toggleSkill(s.skillId)" />
            <span class="skill-name">{{ s.name }}</span>
          </label>
        </div>
        <p v-else class="preset-empty">
          {{ t('agentForm.noSkills') }}
          <router-link to="/skills/add" class="link">{{ t('agentForm.goSkills') }}</router-link>
        </p>
      </div>

      <div class="actions">
        <button class="btn" @click="cancel">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="!form.name.trim() || !form.presetId" @click="save">
          {{ isEdit ? t('common.save') : t('message.create') }}
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

.autofill {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.autofill-row {
  display: flex;
  gap: $spacing-sm;

  select {
    flex: 1;
    min-width: 0;
  }

  .autofill-btn {
    flex-shrink: 0;
    padding: 8px $spacing-lg;
    white-space: nowrap;
  }
}

.autofill-hint {
  font-size: $font-size-xs;
  color: $text-tertiary;
  line-height: 1.5;
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

// 头像本体验编辑：整块点底色弹取色，中央文字区点按进文字编辑
.avatar-editable {
  position: relative;
  width: 56px;
}

.avatar-bg-zone {
  position: absolute;
  inset: 0;
  border-radius: $radius-sm;
  cursor: pointer;
}

.avatar-text-zone {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 32px;
  cursor: text;
}

.avatar-box {
  width: 56px;
  height: 56px;
  border-radius: $radius-sm;

  &.editing {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.avatar-text-input {
  // 略宽于头像方块，6 字输入不裁切
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  padding: 3px 4px;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  border: none;
  border-radius: $radius-sm;
  color: $text-white;
  font-size: 13px;

  &:focus {
    outline: 1px solid rgba(255, 255, 255, 0.6);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }
}

.color-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $spacing-sm;
  width: max-content;
  padding: $spacing-sm;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: $radius-round;
  border: none;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: 1px;
  transition: outline-color $transition-fast;

  &.auto {
    background: transparent;
    border: 1.5px dashed $border-color;
  }

  &.selected {
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

.group-combo {
  position: relative;
}

.group-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
  max-height: 200px;
  overflow-y: auto;

  li {
    padding: 7px $spacing-sm;
    border-radius: $radius-sm;
    color: $text-primary;
    font-size: $font-size-base;
    cursor: pointer;

    &.active {
      background: $bg-hover;
    }
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

.skill-checks {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.skill-check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  cursor: pointer;
  font-size: $font-size-sm;
  color: $text-primary;
  transition: background $transition-fast, outline-color $transition-fast;
  outline: 1px solid transparent;

  &:hover {
    background: $bg-hover;
  }

  &:has(input:checked) {
    background: $primary-light;
    outline-color: $primary-color;
  }

  input {
    accent-color: $primary-color;
    cursor: pointer;
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
