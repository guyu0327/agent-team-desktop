<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getWorkspaceSettings, updateWorkspaceSettings } from '@/api/settings'
import { getAsrStreamSettings, updateAsrStreamSettings } from '@/api/asr'
import type { AsrStreamStatus } from '@/types'
import { desktop } from '@/api/desktop'
import { confirmAction } from '@/composables/confirm'
import { APP_VERSION, GITHUB_REPO_URL, CSDN_BLOG_URL } from '@/constants/app'
import ChangelogModal from './ChangelogModal.vue'

const emit = defineEmits<{ close: [] }>()

const root = ref('')
const extraDirsText = ref('')
const saving = ref(false)
const resetting = ref(false)
const feedback = ref<{ ok: boolean; text: string } | null>(null)

const streamAppId = ref('')
const streamApiKey = ref('')
const streamApiSecret = ref('')
const streamStatus = ref<AsrStreamStatus | null>(null)
const streamSaving = ref(false)
const streamFeedback = ref<{ ok: boolean; text: string } | null>(null)

const backupBusy = ref(false)
const restoreBusy = ref(false)
const backupFeedback = ref<{ ok: boolean; text: string } | null>(null)

const showChangelog = ref(false)

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener')
}

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
    streamStatus.value = s
    streamAppId.value = s.appId
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
    streamStatus.value = s
    streamAppId.value = s.appId
    streamApiKey.value = ''
    streamApiSecret.value = ''
    streamFeedback.value = {
      ok: true,
      text: s.configured
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
  <div class="modal-overlay" @click.self="emit('close')">
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
        <p class="hint">配置讯飞开放平台（xfyun.cn，创建应用并开通「语音听写」，每天 500 次免费）后，点按聊天输入框麦克风即开始实时转写，边说边出字，再次点按或 Esc 停止。密钥保存后不再显示，留空表示保持不变；三项全部留空则清除配置。</p>

        <div class="field">
          <label class="label">APPID</label>
          <input v-model="streamAppId" class="input" type="text" spellcheck="false" placeholder="讯飞应用 APPID" />
        </div>

        <div class="field">
          <label class="label">APIKey</label>
          <input
            v-model="streamApiKey"
            class="input"
            type="password"
            spellcheck="false"
            :placeholder="streamStatus?.hasKey ? '已配置，留空保持不变' : '讯飞应用 APIKey'"
          />
        </div>

        <div class="field">
          <label class="label">APISecret</label>
          <input
            v-model="streamApiSecret"
            class="input"
            type="password"
            spellcheck="false"
            :placeholder="streamStatus?.hasSecret ? '已配置，留空保持不变' : '讯飞应用 APISecret'"
          />
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

      <section class="section">
        <h3 class="section-title">关于</h3>

        <div class="about-row">
          <span class="about-label">版本</span>
          <button class="version-btn" title="查看更新日志" @click="showChangelog = true">
            v{{ APP_VERSION }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div class="about-row">
          <span class="about-label">源码</span>
          <button class="link-btn" title="在浏览器中打开 GitHub 仓库" @click="openExternal(GITHUB_REPO_URL)">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            guyu0327/agent-team-web
          </button>
        </div>

        <div class="about-row">
          <span class="about-label">博客</span>
          <button class="link-btn" title="在浏览器中打开 CSDN 文章" @click="openExternal(CSDN_BLOG_URL)">
            <svg class="csdn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h8M8 17h5" />
            </svg>
            CSDN · 项目介绍
          </button>
        </div>
      </section>
    </div>

    <ChangelogModal v-if="showChangelog" @close="showChangelog = false" />
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

.settings-card {
  width: 560px;
  max-height: 85vh;
  overflow-y: auto;
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

.about-row {
  display: flex;
  align-items: center;
  padding: $spacing-sm 0;

  .about-label {
    width: 120px;
    flex-shrink: 0;
    font-size: $font-size-sm;
    color: $text-tertiary;
  }
}

.version-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $primary-color;
  cursor: pointer;
  transition: opacity $transition-fast;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
}

.link-btn {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 4px $spacing-md;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: $bg-hover;
    color: $text-primary;

    .csdn-icon {
      color: #fc5531;
    }
  }

  .csdn-icon {
    color: $text-tertiary;
    transition: color $transition-fast;
  }
}
</style>
