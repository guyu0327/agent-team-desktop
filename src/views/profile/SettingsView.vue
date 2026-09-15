<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getWorkspaceSettings, updateWorkspaceSettings } from '@/api/settings'
import { getAsrStreamSettings, updateAsrStreamSettings } from '@/api/asr'
import { desktop } from '@/api/desktop'
import { confirmAction } from '@/composables/confirm'

const root = ref('')
const extraDirsText = ref('')
const saving = ref(false)
const resetting = ref(false)
const feedback = ref<{ ok: boolean; text: string } | null>(null)

const streamAppId = ref('')
const streamApiKey = ref('')
const streamApiSecret = ref('')
const streamSaving = ref(false)
const streamFeedback = ref<{ ok: boolean; text: string } | null>(null)

const backupBusy = ref(false)
const restoreBusy = ref(false)
const backupFeedback = ref<{ ok: boolean; text: string } | null>(null)

async function exportBackup() {
  if (backupBusy.value) return
  backupBusy.value = true
  backupFeedback.value = null
  try {
    const r = await desktop.exportBackup()
    if (r.ok) backupFeedback.value = { ok: true, text: `已备份到 ${r.dir}` }
    else if (!r.canceled) backupFeedback.value = { ok: false, text: r.error || '备份失败' }
  } catch (e) {
    backupFeedback.value = { ok: false, text: e instanceof Error ? e.message : '备份失败' }
  } finally {
    backupBusy.value = false
  }
}

/** 恢复成功时应用会整体重启，无需展示反馈 */
async function importBackup() {
  if (restoreBusy.value) return
  restoreBusy.value = true
  backupFeedback.value = null
  try {
    const r = await desktop.importBackup()
    if (r.ok) return
    if (!r.canceled) backupFeedback.value = { ok: false, text: r.error || '恢复失败' }
  } catch (e) {
    backupFeedback.value = { ok: false, text: e instanceof Error ? e.message : '恢复失败' }
  } finally {
    restoreBusy.value = false
  }
}

onMounted(async () => {
  try {
    const s = await getWorkspaceSettings()
    root.value = s.root
    extraDirsText.value = s.extraDirs.join('\n')
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : '加载设置失败' }
  }
  try {
    const s = await getAsrStreamSettings()
    streamAppId.value = s.appId
    streamApiKey.value = s.apiKey
    streamApiSecret.value = s.apiSecret
  } catch (e) {
    streamFeedback.value = { ok: false, text: e instanceof Error ? e.message : '加载实时识别设置失败' }
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

/** 放弃未保存的修改，恢复为当前生效的设置 */
async function reset() {
  if (resetting.value) return
  const ok = await confirmAction({
    title: '放弃修改',
    message: '确定要放弃未保存的修改，恢复为当前生效的设置吗？',
    confirmText: '重置',
    danger: true,
  })
  if (!ok) return
  resetting.value = true
  feedback.value = null
  try {
    const s = await getWorkspaceSettings()
    root.value = s.root
    extraDirsText.value = s.extraDirs.join('\n')
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : '重置失败' }
  } finally {
    resetting.value = false
  }
}

/** 浏览按钮：调用系统资源管理器选择目录 */
async function browseRoot() {
  const dir = await desktop.pickDirectory({
    title: '选择主工作区目录',
    defaultPath: root.value.trim() || undefined,
  })
  if (dir) root.value = dir
}

async function addExtraDir() {
  const dir = await desktop.pickDirectory({ title: '添加白名单目录' })
  if (!dir) return
  const lines = extraDirsText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (!lines.includes(dir)) {
    lines.push(dir)
    extraDirsText.value = lines.join('\n')
  }
}

async function saveAsrStream() {
  if (streamSaving.value) return
  streamSaving.value = true
  streamFeedback.value = null
  try {
    const s = await updateAsrStreamSettings({
      appId: streamAppId.value.trim(),
      apiKey: streamApiKey.value.trim(),
      apiSecret: streamApiSecret.value.trim(),
    })
    streamAppId.value = s.appId
    streamApiKey.value = s.apiKey
    streamApiSecret.value = s.apiSecret
    streamFeedback.value = {
      ok: true,
      text: s.appId
        ? '已保存，点按聊天输入框麦克风即可实时转写'
        : '已清除实时识别配置，麦克风恢复为按住说话',
    }
  } catch (e) {
    streamFeedback.value = { ok: false, text: e instanceof Error ? e.message : '保存失败' }
  } finally {
    streamSaving.value = false
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-card">
      <h2 class="title">设置</h2>

      <section class="section">
        <h3 class="section-title">文件沙箱</h3>
        <p class="hint">智能体只能读写下列目录内的文件。白名单目录必须是绝对路径，每行一个。点击「浏览」直接调用系统资源管理器选择。</p>

        <div class="field">
          <label class="label">主工作区目录</label>
          <div class="input-row">
            <input v-model="root" class="input" type="text" spellcheck="false" placeholder="如 D:\agent-workspace" />
            <button class="browse-btn" @click="browseRoot">浏览</button>
          </div>
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
          <button class="browse-btn add-dir" @click="addExtraDir">＋ 添加白名单目录</button>
        </div>

        <p v-if="feedback" class="feedback" :class="feedback.ok ? 'ok' : 'err'">{{ feedback.text }}</p>

        <div class="actions">
          <button class="reset-btn" :disabled="resetting || saving" @click="reset">重置</button>
          <button class="save-btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title">实时语音识别</h3>
        <p class="hint">配置讯飞开放平台（xfyun.cn，创建应用并开通「语音听写」，每天 500 次免费）后，点按聊天输入框麦克风即开始实时转写，边说边出字，再次点按或 Esc 停止。三项全部留空则清除配置。</p>

        <div class="field">
          <label class="label">APPID</label>
          <input v-model="streamAppId" class="input" type="text" spellcheck="false" placeholder="讯飞应用 APPID" />
        </div>

        <div class="field">
          <label class="label">APIKey</label>
          <input v-model="streamApiKey" class="input" type="password" spellcheck="false" placeholder="讯飞应用 APIKey" />
        </div>

        <div class="field">
          <label class="label">APISecret</label>
          <input v-model="streamApiSecret" class="input" type="password" spellcheck="false" placeholder="讯飞应用 APISecret" />
        </div>

        <p v-if="streamFeedback" class="feedback" :class="streamFeedback.ok ? 'ok' : 'err'">{{ streamFeedback.text }}</p>

        <div class="actions">
          <button class="save-btn" :disabled="streamSaving" @click="saveAsrStream">{{ streamSaving ? '保存中…' : '保存' }}</button>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title">数据管理</h3>
        <p class="hint">备份包含数据库与工作区文件，保存到您选择的文件夹。恢复会用所选备份覆盖当前全部数据，完成后应用自动重启。</p>

        <p v-if="backupFeedback" class="feedback" :class="backupFeedback.ok ? 'ok' : 'err'">{{ backupFeedback.text }}</p>

        <div class="actions actions-start">
          <button class="reset-btn" :disabled="backupBusy || restoreBusy" @click="exportBackup">{{ backupBusy ? '导出中…' : '导出备份' }}</button>
          <button class="reset-btn" :disabled="backupBusy || restoreBusy" @click="importBackup">{{ restoreBusy ? '恢复中…' : '从备份恢复' }}</button>
          <button class="reset-btn" @click="desktop.openDataDir()">打开数据目录</button>
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

.section + .section {
  margin-top: $spacing-xxl;
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

  code {
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
    font-size: 0.9em;
    color: $text-secondary;
  }
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

.input-row {
  display: flex;
  gap: $spacing-sm;

  .input {
    flex: 1;
  }
}

.browse-btn {
  padding: 8px $spacing-lg;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  white-space: nowrap;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }

  &.add-dir {
    margin-top: $spacing-sm;
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
  gap: $spacing-md;

  &.actions-start {
    justify-content: flex-start;
  }
}

.reset-btn {
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  background: $bg-input;
  color: $text-primary;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
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
