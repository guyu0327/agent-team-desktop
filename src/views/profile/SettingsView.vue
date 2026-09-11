<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getWorkspaceSettings, updateWorkspaceSettings } from '@/api/settings'

const root = ref('')
const extraDirsText = ref('')
const saving = ref(false)
const feedback = ref<{ ok: boolean; text: string } | null>(null)

onMounted(async () => {
  try {
    const s = await getWorkspaceSettings()
    root.value = s.root
    extraDirsText.value = s.extraDirs.join('\n')
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : '加载设置失败' }
  }
})

async function save() {
  if (saving.value) return
  saving.value = true
  feedback.value = null
  const extras = extraDirsText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  try {
    const s = await updateWorkspaceSettings(root.value.trim(), extras)
    root.value = s.root
    extraDirsText.value = s.extraDirs.join('\n')
    feedback.value = { ok: true, text: '已保存，对智能体立即生效' }
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : '保存失败' }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-card">
      <h2 class="title">设置</h2>

      <section class="section">
        <h3 class="section-title">文件沙箱</h3>
        <p class="hint">智能体只能读写下列目录内的文件。主工作区可用相对路径（相对后端运行目录）；白名单目录必须是绝对路径，每行一个。</p>

        <div class="field">
          <label class="label">主工作区目录</label>
          <input v-model="root" class="input" type="text" spellcheck="false" placeholder="如 ./workspace 或 D:\agent-workspace" />
        </div>

        <div class="field">
          <label class="label">白名单目录（每行一个）</label>
          <textarea
            v-model="extraDirsText"
            class="input textarea"
            rows="4"
            spellcheck="false"
            placeholder="如 D:\Git\my-project"
          ></textarea>
        </div>

        <p v-if="feedback" class="feedback" :class="feedback.ok ? 'ok' : 'err'">{{ feedback.text }}</p>

        <div class="actions">
          <button class="save-btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.settings-card {
  width: 560px;
  align-self: flex-start;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
}

.title {
  font-size: $font-size-xl;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: $spacing-lg;
}

.section-title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: $spacing-sm;
}

.hint {
  font-size: $font-size-sm;
  color: $text-tertiary;
  line-height: 1.6;
  margin-bottom: $spacing-md;
}

.field {
  margin-bottom: $spacing-md;

  .label {
    display: block;
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }
}

.input {
  width: 100%;
  padding: 9px $spacing-md;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;
  outline: none;
  transition: border-color $transition-fast;

  &:focus {
    border-color: $primary-color;
  }

  &.textarea {
    resize: vertical;
    min-height: 88px;
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
    font-size: $font-size-sm;
    line-height: 1.6;
  }
}

.feedback {
  font-size: $font-size-sm;
  margin-bottom: $spacing-sm;

  &.ok {
    color: #34d399;
  }

  &.err {
    color: #fa5151;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  background: $primary-color;
  color: $text-white;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $primary-hover;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
</style>
