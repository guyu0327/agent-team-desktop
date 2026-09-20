<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ScheduledTask, TaskDraft } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { createTask, updateTask } from '@/api/tasks'
import { alertAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ task?: ScheduledTask; fixedAgentId?: string }>()

const emit = defineEmits<{
  close: []
  saved: [conversationId: string]
}>()

const agentStore = useAgentStore()

const editing = computed(() => !!props.task)

const agentId = ref(props.task?.agentId ?? props.fixedAgentId ?? agentStore.agents[0]?.id ?? '')
const memberIds = ref<string[]>([])
const name = ref(props.task?.name ?? '')
const content = ref(props.task?.content ?? '')
const kind = ref<ScheduledTask['kind']>(props.task?.kind ?? 'daily')
/** 任务类型：普通=智能体独立执行；协作=编排者拉成员建群（创建后不可改） */
const mode = ref<'normal' | 'collab'>(props.task?.mode ?? 'normal')
/** 错过的单次任务启动时是否补发，默认不补发 */
const catchUp = ref(!!props.task?.catchUp)
/** 后台触发回合的审批放行策略：写改文件默认开，执行命令默认关（手动执行的回合不受影响） */
const autoWrite = ref(props.task ? props.task.autoWrite !== false : true)
const autoShell = ref(!!props.task?.autoShell)

const orchestrators = computed(() => agentStore.agents.filter((a) => a.isOrchestrator))
/** 执行者候选：普通任务全员可选；协作任务只能选编排者 */
const executorCandidates = computed(() =>
  mode.value === 'collab' && orchestrators.value.length > 0 ? orchestrators.value : agentStore.agents,
)

function switchMode(m: 'normal' | 'collab') {
  if (props.task || m === mode.value) return
  mode.value = m
  if (m === 'collab' && !orchestrators.value.some((a) => a.id === agentId.value)) {
    const first = orchestrators.value[0] ?? agentStore.agents[0]
    if (first) agentId.value = first.id
  }
  if (m === 'normal') memberIds.value = []
}

const runAtLocal = ref(
  props.task?.runAt ? toLocalInput(new Date(props.task.runAt)) : defaultRunAt(),
)
const timeOfDay = ref(props.task?.timeOfDay ?? '09:00')
const daysOfWeek = ref<string[]>(props.task?.daysOfWeek ? props.task.daysOfWeek.split(',') : ['1'])
const intervalMinutes = ref(props.task?.intervalMinutes ?? 60)

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 单次任务默认明天此刻，避免默认值已在过去被后端拒绝 */
function defaultRunAt(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return toLocalInput(d)
}

const KINDS: ScheduledTask['kind'][] = ['once', 'daily', 'weekly', 'interval']

const kindLabel = (k: ScheduledTask['kind']) =>
  ({ once: t('tasks.kindOnce'), daily: t('tasks.kindDaily'), weekly: t('tasks.kindWeekly'), interval: t('tasks.kindInterval') })[k]

const memberCandidates = computed(() =>
  agentStore.agents.filter((a) => !a.isOrchestrator && a.id !== agentId.value),
)

function toggleMember(id: string) {
  const idx = memberIds.value.indexOf(id)
  if (idx >= 0) memberIds.value.splice(idx, 1)
  else memberIds.value.push(id)
}

function toggleDay(day: string) {
  const idx = daysOfWeek.value.indexOf(day)
  if (idx >= 0) daysOfWeek.value.splice(idx, 1)
  else daysOfWeek.value.push(day)
}

const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7']
const weekdayShort = computed(() => t('tasks.weekdaysShort').split(','))

const canSave = computed(() => {
  if (!agentId.value || !name.value.trim() || !content.value.trim()) return false
  if (!props.task && mode.value === 'collab' && memberIds.value.length === 0) return false
  if (kind.value === 'once') return !!runAtLocal.value
  if (kind.value === 'daily') return !!timeOfDay.value
  if (kind.value === 'weekly') return !!timeOfDay.value && daysOfWeek.value.length > 0
  return (intervalMinutes.value ?? 0) >= 1
})

/** 与后端 describe 同口径的触发方式文案预览 */
const preview = computed(() => {
  if (!canSave.value) return ''
  const days = (t('tasks.weekdaysShort').split(',') as string[])
  switch (kind.value) {
    case 'once':
      return runAtLocal.value ? new Date(runAtLocal.value).toLocaleString() : ''
    case 'daily':
      return t('tasks.descDaily', { time: timeOfDay.value })
    case 'weekly':
      return t('tasks.descWeekly', {
        days: [...daysOfWeek.value]
          .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
          .map((d) => days[Number(d) - 1])
          .join('、'),
        time: timeOfDay.value,
      })
    case 'interval':
      return t('tasks.descInterval', { n: intervalMinutes.value })
  }
})

const saving = ref(false)

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  const draft: TaskDraft = {
    name: name.value.trim(),
    content: content.value.trim(),
    kind: kind.value,
    runAt: kind.value === 'once' ? new Date(runAtLocal.value).getTime() : null,
    timeOfDay: kind.value === 'daily' || kind.value === 'weekly' ? timeOfDay.value : null,
    daysOfWeek: kind.value === 'weekly' ? [...daysOfWeek.value].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)).join(',') : null,
    intervalMinutes: kind.value === 'interval' ? intervalMinutes.value : null,
    catchUp: catchUp.value,
    autoWrite: autoWrite.value,
    autoShell: autoShell.value,
  }
  try {
    if (props.task) {
      const saved = await updateTask(props.task.id, draft)
      emit('saved', saved.conversationId)
    } else {
      const saved = await createTask({
        ...draft,
        mode: mode.value,
        agentId: agentId.value,
        memberIds: mode.value === 'collab' ? memberIds.value : [],
      })
      emit('saved', saved.conversationId)
    }
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h2 class="modal-title">{{ editing ? t('tasks.edit') : t('tasks.new') }}</h2>

      <div class="field">
        <label class="label">{{ t('tasks.name') }}</label>
        <input v-model="name" class="input" maxlength="40" :placeholder="t('tasks.namePh')" autofocus />
      </div>

      <div class="field">
        <label class="label">{{ t('tasks.content') }}</label>
        <textarea v-model="content" class="input area" rows="3" :placeholder="t('tasks.contentPh')" />
      </div>

      <div v-if="!props.task" class="field">
        <label class="label">{{ t('tasks.mode') }}</label>
        <div class="kind-row">
          <button
            type="button"
            class="kind-btn"
            :class="{ active: mode === 'normal' }"
            @click="switchMode('normal')"
          >
            {{ t('tasks.modeNormal') }}
          </button>
          <button
            type="button"
            class="kind-btn"
            :class="{ active: mode === 'collab' }"
            @click="switchMode('collab')"
          >
            {{ t('tasks.modeCollab') }}
          </button>
        </div>
        <span class="hint">{{ t('tasks.modeHint') }}</span>
      </div>

      <div class="field">
        <label class="label">{{ t('tasks.agent') }}</label>
        <div class="agent-list">
          <button
            v-for="a in executorCandidates"
            :key="a.id"
            type="button"
            class="agent-row"
            :class="{ selected: a.id === agentId, disabled: !!props.task && a.id !== agentId }"
            :disabled="!!props.task"
            @click="agentId = a.id"
          >
            <Avatar :name="a.name" :avatar="a.avatar" :size="28" />
            <span class="agent-name">{{ a.name }}</span>
            <span class="check" :class="{ checked: a.id === agentId }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="m5 12 5 5 9-10" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <div v-if="!props.task && mode === 'collab' && memberCandidates.length > 0" class="field">
        <label class="label">{{ t('tasks.members') }}</label>
        <div class="member-chips">
          <button
            v-for="a in memberCandidates"
            :key="a.id"
            type="button"
            class="member-chip"
            :class="{ selected: memberIds.includes(a.id) }"
            @click="toggleMember(a.id)"
          >
            <Avatar :name="a.name" :avatar="a.avatar" :size="20" />
            {{ a.name }}
          </button>
        </div>
        <span class="hint">{{ t('tasks.membersHintCollab') }}</span>
      </div>

      <div class="field">
        <label class="label">{{ t('tasks.kind') }}</label>
        <div class="kind-row">
          <button
            v-for="k in KINDS"
            :key="k"
            type="button"
            class="kind-btn"
            :class="{ active: kind === k }"
            @click="kind = k"
          >
            {{ kindLabel(k) }}
          </button>
        </div>

        <div v-if="kind === 'once'" class="sub-field">
          <label class="label">{{ t('tasks.runAt') }}</label>
          <input v-model="runAtLocal" class="input" type="datetime-local" />
        </div>
        <div v-else-if="kind === 'daily'" class="sub-field">
          <label class="label">{{ t('tasks.timeOfDay') }}</label>
          <input v-model="timeOfDay" class="input time" type="time" />
        </div>
        <template v-else-if="kind === 'weekly'">
          <div class="sub-field">
            <label class="label">{{ t('tasks.timeOfDay') }}</label>
            <input v-model="timeOfDay" class="input time" type="time" />
          </div>
          <div class="sub-field">
            <label class="label">{{ t('tasks.daysOfWeek') }}</label>
            <div class="dow-row">
              <button
                v-for="(d, i) in WEEKDAYS"
                :key="d"
                type="button"
                class="dow"
                :class="{ active: daysOfWeek.includes(d) }"
                @click="toggleDay(d)"
              >
                {{ weekdayShort[i] }}
              </button>
            </div>
          </div>
        </template>
        <div v-else class="sub-field">
          <label class="label">{{ t('tasks.intervalMinutes') }}</label>
          <input v-model.number="intervalMinutes" class="input" type="number" min="1" />
        </div>

        <div v-if="kind === 'once'" class="catchup-row">
          <button type="button" class="switch" :class="{ on: catchUp }" @click="catchUp = !catchUp">
            <span class="knob" />
          </button>
          <div class="catchup-text">
            <span class="catchup-label">{{ t('tasks.catchUp') }}</span>
            <span class="hint">{{ t('tasks.catchUpHint') }}</span>
          </div>
        </div>
      </div>

      <div class="field">
        <label class="label">{{ t('tasks.autoApprove') }}</label>
        <div class="catchup-row">
          <button type="button" class="switch" :class="{ on: autoWrite }" @click="autoWrite = !autoWrite">
            <span class="knob" />
          </button>
          <div class="catchup-text">
            <span class="catchup-label">{{ t('tasks.autoWrite') }}</span>
            <span class="hint">{{ t('tasks.autoWriteHint') }}</span>
          </div>
        </div>
        <div class="catchup-row">
          <button type="button" class="switch" :class="{ on: autoShell }" @click="autoShell = !autoShell">
            <span class="knob" />
          </button>
          <div class="catchup-text">
            <span class="catchup-label">{{ t('tasks.autoShell') }}</span>
            <span class="hint">{{ t('tasks.autoShellHint') }}</span>
          </div>
        </div>
        <span class="hint">{{ t('tasks.autoApproveHint') }}</span>
      </div>

      <div v-if="preview" class="preview">
        {{ t('tasks.preview') }}: {{ preview }}
      </div>

      <div class="actions">
        <button class="btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="!canSave || saving" @click="save">
          {{ editing ? t('common.save') : t('message.create') }}
        </button>
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
  width: 460px;
  max-height: 84vh;
  overflow-y: auto;
  background: $bg-panel;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xl;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.modal-title {
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
}

.input {
  width: 100%;
  padding: 8px $spacing-md;
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

  &.area {
    resize: vertical;
    line-height: 1.5;
  }

  &.time {
    width: 140px;
  }
}

.hint {
  font-size: $font-size-xs;
  color: $text-tertiary;
  line-height: 1.5;
}

.agent-list {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 5px 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover:not(.disabled) {
    border-color: $primary-color;
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.selected {
    border-color: $primary-color;
  }

  .agent-name {
    font-size: $font-size-sm;
    color: $text-primary;
  }

  .check {
    display: none;
    width: 14px;
    height: 14px;
    color: $primary-color;

    svg {
      width: 100%;
      height: 100%;
    }

    &.checked {
      display: flex;
    }
  }
}

.member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.member-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid $border-color;
  border-radius: 999px;
  background: $bg-input;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    border-color: $text-tertiary;
  }

  &.selected {
    border-color: $primary-color;
    color: $primary-color;
    background: rgba(var(--c-primary-rgb), 0.08);
  }
}

.kind-row {
  display: flex;
  gap: $spacing-sm;
}

.kind-btn {
  flex: 1;
  padding: 6px 0;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-secondary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    color: $text-primary;
  }

  &.active {
    border-color: $primary-color;
    color: $primary-color;
    background: rgba(var(--c-primary-rgb), 0.08);
  }
}

.sub-field {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.catchup-row {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  padding-top: $spacing-xs;

  .switch {
    flex-shrink: 0;
    width: 34px;
    height: 20px;
    margin-top: 2px;
    border-radius: 999px;
    background: $border-color;
    position: relative;
    transition: background $transition-fast;

    .knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: $text-white;
      transition: left $transition-fast;
    }

    &.on {
      background: $primary-color;

      .knob {
        left: 16px;
      }
    }
  }

  .catchup-text {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .catchup-label {
      font-size: $font-size-sm;
      color: $text-primary;
    }
  }
}

.dow-row {
  display: flex;
  gap: $spacing-xs;
}

.dow {
  width: 38px;
  height: 30px;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: all $transition-fast;

  &.active {
    border-color: $primary-color;
    color: $primary-color;
    background: rgba(var(--c-primary-rgb), 0.08);
  }
}

.preview {
  font-size: $font-size-xs;
  color: $text-tertiary;
  padding: $spacing-sm $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
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
