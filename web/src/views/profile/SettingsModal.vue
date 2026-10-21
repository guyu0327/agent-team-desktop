<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getWorkspaceSettings, updateWorkspaceSettings } from '@/api/settings'
import { getCoordinationLimits, updateCoordinationLimits } from '@/api/settings'
import { getContextCompression, updateContextCompression } from '@/api/settings'
import { getBrowserSettings, updateBrowserSettings } from '@/api/settings'
import { getAsrStreamSettings, updateAsrStreamSettings } from '@/api/asr'
import { clearAnySearchSettings, getAnySearchSettings, updateAnySearchSettings } from '@/api/anysearch'
import type { AnySearchStatus, AsrStreamStatus } from '@/types'
import { desktop, openLocalPath } from '@/api/desktop'
import { confirmAction } from '@/composables/confirm'
import { closePref, loadClosePref, setClosePref } from '@/composables/closeConfirm'
import { showToast } from '@/composables/toast'
import {
  applyLang,
  applyTheme,
  currentLang,
  currentTheme,
  type AppLang,
  type ThemeMode,
} from '@/composables/appearance'
import { t } from '@/i18n'
import { APP_VERSION, GITHUB_REPO_URL, CSDN_BLOG_URL } from '@/constants/app'
import ChangelogModal from './ChangelogModal.vue'
import LogsModal from './LogsModal.vue'

const emit = defineEmits<{ close: [] }>()

// 遮罩关闭判定：按下与松开都发生在遮罩上才关闭，按住从卡片内拖到遮罩松手不关
const maskDown = ref(false)
const maskUp = ref(false)

const root = ref('')
const extraDirs = ref<string[]>([])
const saving = ref(false)
const resetting = ref(false)
const feedback = ref<{ ok: boolean; text: string } | null>(null)

// 最近一次生效的值：保存/加载后更新，用于判定「已修改」才显示保存重置按钮
const savedRoot = ref('')
const savedDirs = ref<string[]>([])

const sandboxDirty = computed(() => {
  if (root.value.trim() !== savedRoot.value.trim()) return true
  const a = extraDirs.value
  const b = savedDirs.value
  return a.length !== b.length || a.some((d, i) => d !== b[i])
})

const streamAppId = ref('')
const streamApiKey = ref('')
const streamApiSecret = ref('')
const streamStatus = ref<AsrStreamStatus | null>(null)
const streamSaving = ref(false)
const streamFeedback = ref<{ ok: boolean; text: string } | null>(null)

const savedStreamAppId = ref('')

const asrDirty = computed(
  () =>
    streamAppId.value.trim() !== savedStreamAppId.value ||
    streamApiKey.value !== '' ||
    streamApiSecret.value !== '',
)

const webApiKey = ref('')
const webStatus = ref<AnySearchStatus | null>(null)
const webSaving = ref(false)
const webFeedback = ref<{ ok: boolean; text: string } | null>(null)

const webDirty = computed(() => webApiKey.value !== '')

const backupBusy = ref(false)
const restoreBusy = ref(false)
const backupFeedback = ref<{ ok: boolean; text: string } | null>(null)

const overallMin = ref(60)
const memberMin = ref(5)
const savedOverall = ref(60)
const savedMember = ref(5)
const limitsSaving = ref(false)
const limitsFeedback = ref<{ ok: boolean; text: string } | null>(null)

const limitsDirty = computed(() => overallMin.value !== savedOverall.value || memberMin.value !== savedMember.value)

function resetLimits() {
  overallMin.value = savedOverall.value
  memberMin.value = savedMember.value
}

async function saveLimits() {
  const overall = Math.floor(Number(overallMin.value))
  const member = Math.floor(Number(memberMin.value))
  if (!Number.isFinite(overall) || overall < 1 || overall > 1440 || !Number.isFinite(member) || member < 1 || member > 120) {
    limitsFeedback.value = { ok: false, text: t('settings.limitsInvalid') }
    return
  }
  if (limitsSaving.value) return
  limitsSaving.value = true
  limitsFeedback.value = null
  try {
    const s = await updateCoordinationLimits(overall, member)
    overallMin.value = s.overallMinutes
    memberMin.value = s.memberMinutes
    savedOverall.value = s.overallMinutes
    savedMember.value = s.memberMinutes
    limitsFeedback.value = { ok: true, text: t('settings.limitsSaved') }
  } catch (e) {
    limitsFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    limitsSaving.value = false
  }
}

const launchAtLogin = ref(false)
const launchBusy = ref(false)

const compressionEnabled = ref(true)
const compressionBudget = ref(60000)
const savedCompressionEnabled = ref(true)
const savedCompressionBudget = ref(60000)
const compressionSaving = ref(false)
const compressionFeedback = ref<{ ok: boolean; text: string } | null>(null)

const compressionDirty = computed(
  () => compressionEnabled.value !== savedCompressionEnabled.value || compressionBudget.value !== savedCompressionBudget.value,
)

function resetCompression() {
  compressionEnabled.value = savedCompressionEnabled.value
  compressionBudget.value = savedCompressionBudget.value
}

async function saveCompression() {
  const budget = Math.floor(Number(compressionBudget.value))
  if (!Number.isFinite(budget) || budget < 5000 || budget > 500000) {
    compressionFeedback.value = { ok: false, text: t('settings.compressionInvalid') }
    return
  }
  if (compressionSaving.value) return
  compressionSaving.value = true
  compressionFeedback.value = null
  try {
    const s = await updateContextCompression(compressionEnabled.value, budget)
    compressionEnabled.value = s.enabled
    compressionBudget.value = s.budgetChars
    savedCompressionEnabled.value = s.enabled
    savedCompressionBudget.value = s.budgetChars
    compressionFeedback.value = { ok: true, text: t('settings.compressionSaved') }
  } catch (e) {
    compressionFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    compressionSaving.value = false
  }
}

const browserHeadless = ref(false)
const savedBrowserHeadless = ref(false)
const browserPersistLogin = ref(false)
const savedBrowserPersistLogin = ref(false)
const browserWhitelist = ref<string[]>([])
const savedBrowserWhitelist = ref<string[]>([])
const browserNewDomain = ref('')
const browserSaving = ref(false)
const browserFeedback = ref<{ ok: boolean; text: string } | null>(null)

const browserDirty = computed(
  () =>
    browserHeadless.value !== savedBrowserHeadless.value ||
    browserPersistLogin.value !== savedBrowserPersistLogin.value ||
    JSON.stringify(browserWhitelist.value) !== JSON.stringify(savedBrowserWhitelist.value),
)

function resetBrowser() {
  browserHeadless.value = savedBrowserHeadless.value
  browserPersistLogin.value = savedBrowserPersistLogin.value
  browserWhitelist.value = [...savedBrowserWhitelist.value]
}

/** 输入可能是裸域名也可能带协议，统一规整成主机名（后端保存时也会再兜底一次） */
function addBrowserDomain() {
  const raw = browserNewDomain.value.trim().toLowerCase()
  if (!raw) return
  let host = raw
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
  } catch {
    /* 按裸域名原样交给后端规整 */
  }
  if (host && !browserWhitelist.value.includes(host)) {
    browserWhitelist.value = [...browserWhitelist.value, host].sort()
  }
  browserNewDomain.value = ''
}

function removeBrowserDomain(host: string) {
  browserWhitelist.value = browserWhitelist.value.filter((d) => d !== host)
}

async function saveBrowser() {
  if (browserSaving.value) return
  browserSaving.value = true
  browserFeedback.value = null
  try {
    const s = await updateBrowserSettings(browserHeadless.value, browserPersistLogin.value, browserWhitelist.value)
    browserHeadless.value = s.headless
    savedBrowserHeadless.value = s.headless
    browserPersistLogin.value = s.persistLogin
    savedBrowserPersistLogin.value = s.persistLogin
    browserWhitelist.value = [...s.whitelist]
    savedBrowserWhitelist.value = [...s.whitelist]
    browserFeedback.value = { ok: true, text: t('settings.browserSaved') }
  } catch (e) {
    browserFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    browserSaving.value = false
  }
}

const theme = ref<ThemeMode>(currentTheme())
const lang = ref<AppLang>(currentLang())

// 关闭窗口行为：与关闭确认框共用同一偏好（'ask' 即每次询问）
loadClosePref()

function selectTheme(mode: ThemeMode) {
  theme.value = mode
  applyTheme(mode)
}

function selectLang(l: AppLang) {
  lang.value = l
  applyLang(l)
}

const showChangelog = ref(false)
const showLogs = ref(false)

// 可折叠分区（系统设置/数据管理/关于常显），默认全部收起
// 可折叠分区（手风琴：同时只展开一个；数据管理/关于常显），默认展开系统设置
const openSection = ref('system')
const toggleSection = (k: string) => {
  openSection.value = openSection.value === k ? '' : k
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener')
}

async function exportBackup() {
  if (backupBusy.value) return
  backupBusy.value = true
  backupFeedback.value = null
  try {
    const r = await desktop.exportBackup()
    if (r.ok) backupFeedback.value = { ok: true, text: t('settings.backedUp', { dir: r.dir ?? '' }) }
    else if (!r.canceled) backupFeedback.value = { ok: false, text: r.error || t('settings.backupFailed') }
  } catch (e) {
    backupFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.backupFailed') }
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
    if (!r.canceled) backupFeedback.value = { ok: false, text: r.error || t('settings.restoreFailed') }
  } catch (e) {
    backupFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.restoreFailed') }
  } finally {
    restoreBusy.value = false
  }
}

onMounted(async () => {
  try {
    const s = await getWorkspaceSettings()
    root.value = s.root
    extraDirs.value = [...s.extraDirs]
    savedRoot.value = s.root
    savedDirs.value = [...s.extraDirs]
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.loadFailed') }
  }
  try {
    const s = await getAsrStreamSettings()
    streamStatus.value = s
    streamAppId.value = s.appId
    savedStreamAppId.value = s.appId
  } catch (e) {
    streamFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.asrLoadFailed') }
  }
  try {
    webStatus.value = await getAnySearchSettings()
  } catch (e) {
    webFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.webSearchLoadFailed') }
  }
  try {
    const l = await getCoordinationLimits()
    overallMin.value = l.overallMinutes
    memberMin.value = l.memberMinutes
    savedOverall.value = l.overallMinutes
    savedMember.value = l.memberMinutes
  } catch (e) {
    limitsFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.loadFailed') }
  }
  try {
    const c = await getContextCompression()
    compressionEnabled.value = c.enabled
    compressionBudget.value = c.budgetChars
    savedCompressionEnabled.value = c.enabled
    savedCompressionBudget.value = c.budgetChars
  } catch (e) {
    compressionFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.loadFailed') }
  }
  try {
    const b = await getBrowserSettings()
    browserHeadless.value = b.headless
    savedBrowserHeadless.value = b.headless
    browserPersistLogin.value = b.persistLogin
    savedBrowserPersistLogin.value = b.persistLogin
    browserWhitelist.value = [...(b.whitelist ?? [])]
    savedBrowserWhitelist.value = [...(b.whitelist ?? [])]
  } catch (e) {
    browserFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.loadFailed') }
  }
  if (desktop.getLoginItem) {
    try {
      launchAtLogin.value = await desktop.getLoginItem()
    } catch {
      /* 读取失败保持默认不勾选 */
    }
  }
})

async function save() {
  if (saving.value) return
  saving.value = true
  feedback.value = null
  try {
    const s = await updateWorkspaceSettings(root.value.trim(), extraDirs.value)
    root.value = s.root
    extraDirs.value = [...s.extraDirs]
    savedRoot.value = s.root
    savedDirs.value = [...s.extraDirs]
    feedback.value = { ok: true, text: t('settings.saved') }
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    saving.value = false
  }
}

/** 放弃未保存的修改，恢复为当前生效的设置 */
async function reset() {
  if (resetting.value) return
  const ok = await confirmAction({
    title: t('settings.resetTitle'),
    message: t('settings.resetMsg'),
    confirmText: t('settings.reset'),
    danger: true,
  })
  if (!ok) return
  resetting.value = true
  feedback.value = null
  try {
    const s = await getWorkspaceSettings()
    root.value = s.root
    extraDirs.value = [...s.extraDirs]
    savedRoot.value = s.root
    savedDirs.value = [...s.extraDirs]
  } catch (e) {
    feedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.resetFailed') }
  } finally {
    resetting.value = false
  }
}

/** 浏览按钮：调用系统资源管理器选择目录 */
async function browseRoot() {
  const dir = await desktop.pickDirectory({
    title: t('settings.pickRootTitle'),
    defaultPath: root.value.trim() || undefined,
  })
  if (dir) root.value = dir
}

async function addExtraDir() {
  const dir = await desktop.pickDirectory({ title: t('settings.pickWhitelistTitle') })
  if (!dir) return
  if (!extraDirs.value.includes(dir)) extraDirs.value.push(dir)
}

function removeExtraDir(dir: string) {
  extraDirs.value = extraDirs.value.filter((d) => d !== dir)
}

async function openDir(path: string) {
  const err = await openLocalPath(path)
  if (err) showToast(err)
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
    savedStreamAppId.value = s.appId
    streamApiKey.value = ''
    streamApiSecret.value = ''
    streamFeedback.value = {
      ok: true,
      text: s.configured ? t('settings.asrSaved') : t('settings.asrCleared'),
    }
  } catch (e) {
    streamFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    streamSaving.value = false
  }
}

/** 放弃未保存的实时识别修改，恢复为当前生效的配置（密钥本来就不回显，直接清空即可） */
function resetAsrStream() {
  streamAppId.value = savedStreamAppId.value
  streamApiKey.value = ''
  streamApiSecret.value = ''
}

async function saveWebSearch() {
  if (webSaving.value) return
  webSaving.value = true
  webFeedback.value = null
  try {
    const s = await updateAnySearchSettings({ apiKey: webApiKey.value.trim() })
    webStatus.value = s
    webApiKey.value = ''
    webFeedback.value = { ok: true, text: t('settings.webSearchSaved') }
  } catch (e) {
    webFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    webSaving.value = false
  }
}

function resetWebSearch() {
  webApiKey.value = ''
}

/** 清除 Key 恢复匿名免费档（Key 不回显，「留空保存」只表示不变，清除需显式确认） */
async function clearWebSearch() {
  if (webSaving.value) return
  const ok = await confirmAction({
    title: t('settings.webSearchClearTitle'),
    message: t('settings.webSearchClearMsg'),
    confirmText: t('settings.webSearchClear'),
    danger: true,
  })
  if (!ok) return
  webSaving.value = true
  webFeedback.value = null
  try {
    const s = await clearAnySearchSettings()
    webStatus.value = s
    webApiKey.value = ''
    webFeedback.value = { ok: true, text: t('settings.webSearchCleared') }
  } catch (e) {
    webFeedback.value = { ok: false, text: e instanceof Error ? e.message : t('settings.saveFailed') }
  } finally {
    webSaving.value = false
  }
}

/** 开机自启：点按即生效，以主进程回读的实际状态为准 */
async function toggleLaunchAtLogin() {
  if (launchBusy.value || !desktop.getLoginItem || !desktop.setLoginItem) return
  launchBusy.value = true
  try {
    launchAtLogin.value = await desktop.setLoginItem(!launchAtLogin.value)
  } catch {
    showToast(t('settings.launchFailed'))
  } finally {
    launchBusy.value = false
  }
}
</script>

<template>
  <div
    class="modal-overlay"
    @pointerdown="maskDown = $event.target === $event.currentTarget"
    @pointerup="maskUp = $event.target === $event.currentTarget"
    @click.self="maskDown && maskUp && emit('close')"
  >
    <div class="settings-card">
      <h2 class="title">{{ t('settings.title') }}</h2>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'system' }" @click="toggleSection('system')">
          {{ t('settings.system') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'system'" class="section-body">
          <button v-if="desktop?.getLoginItem" class="setting-row" :disabled="launchBusy" @click="toggleLaunchAtLogin">
            <span class="row-info">
              <span class="row-name">{{ t('settings.launchAtLogin') }}</span>
              <span class="row-desc">{{ t('settings.launchDesc') }}</span>
            </span>
            <span class="switch" :class="{ on: launchAtLogin }"><span class="knob"></span></span>
          </button>

          <div class="setting-row">
            <span class="row-info">
              <span class="row-name">{{ t('settings.theme') }}</span>
              <span class="row-desc">{{ t('settings.themeDesc') }}</span>
            </span>
            <div class="seg">
              <button class="seg-btn" :class="{ on: theme === 'dark' }" @click="selectTheme('dark')">{{ t('settings.dark') }}</button>
              <button class="seg-btn" :class="{ on: theme === 'light' }" @click="selectTheme('light')">{{ t('settings.light') }}</button>
            </div>
          </div>

          <div class="setting-row">
            <span class="row-info">
              <span class="row-name">{{ t('settings.lang') }}</span>
              <span class="row-desc">{{ t('settings.langDesc') }}</span>
            </span>
            <div class="seg">
              <button class="seg-btn" :class="{ on: lang === 'zh' }" @click="selectLang('zh')">中文</button>
              <button class="seg-btn" :class="{ on: lang === 'en' }" @click="selectLang('en')">English</button>
            </div>
          </div>

          <div class="setting-row">
            <span class="row-info">
              <span class="row-name">{{ t('settings.closeAction') }}</span>
              <span class="row-desc">{{ t('settings.closeActionDesc') }}</span>
            </span>
            <div class="seg">
              <button class="seg-btn" :class="{ on: closePref === 'ask' }" @click="setClosePref('ask')">{{ t('settings.closeAsk') }}</button>
              <button class="seg-btn" :class="{ on: closePref === 'minimize' }" @click="setClosePref('minimize')">{{ t('settings.closeMinimize') }}</button>
              <button class="seg-btn" :class="{ on: closePref === 'quit' }" @click="setClosePref('quit')">{{ t('settings.closeQuit') }}</button>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'sandbox' }" @click="toggleSection('sandbox')">
          {{ t('settings.sandbox') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'sandbox'" class="section-body">
          <p class="hint">{{ t('settings.sandboxHint') }}</p>

          <div class="field">
            <label class="label">{{ t('settings.rootLabel') }}</label>
            <div class="input-row">
              <input v-model="root" class="input" type="text" spellcheck="false" :placeholder="t('settings.rootPlaceholder')" />
              <button class="browse-btn" :disabled="!root.trim()" @click="openDir(root.trim())">{{ t('common.open') }}</button>
              <button class="browse-btn" @click="browseRoot">{{ t('settings.modify') }}</button>
            </div>
          </div>

          <div class="field">
            <label class="label">{{ t('settings.whitelist') }}</label>
            <div class="dir-list">
              <div v-for="d in extraDirs" :key="d" class="dir-row">
                <svg class="dir-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span class="dir-path" :title="d">{{ d }}</span>
                <button class="row-btn" @click="openDir(d)">{{ t('common.open') }}</button>
                <button class="row-btn danger" @click="removeExtraDir(d)">{{ t('common.remove') }}</button>
              </div>
              <div v-if="extraDirs.length === 0" class="dir-empty">{{ t('settings.whitelistEmpty') }}</div>
            </div>
            <button class="browse-btn add-dir" @click="addExtraDir">{{ t('settings.addWhitelist') }}</button>
          </div>

          <p v-if="feedback" class="feedback" :class="feedback.ok ? 'ok' : 'err'">{{ feedback.text }}</p>

          <div v-if="sandboxDirty" class="actions">
            <button class="reset-btn" :disabled="resetting || saving" @click="reset">{{ t('settings.reset') }}</button>
            <button class="save-btn" :disabled="saving" @click="save">{{ saving ? t('settings.saving') : t('common.save') }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'asr' }" @click="toggleSection('asr')">
          {{ t('settings.asr') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'asr'" class="section-body">
          <p class="hint">{{ t('settings.asrHint') }}</p>

          <div class="field">
            <label class="label">{{ t('settings.asrAppId') }}</label>
            <input v-model="streamAppId" class="input" type="text" spellcheck="false" :placeholder="t('settings.asrAppIdPlaceholder')" />
          </div>

          <div class="field">
            <label class="label">{{ t('settings.asrKey') }}</label>
            <input
              v-model="streamApiKey"
              class="input"
              type="password"
              spellcheck="false"
              :placeholder="streamStatus?.hasKey ? t('settings.asrKeySaved') : t('settings.asrKeyPlaceholder')"
            />
          </div>

          <div class="field">
            <label class="label">{{ t('settings.asrSecret') }}</label>
            <input
              v-model="streamApiSecret"
              class="input"
              type="password"
              spellcheck="false"
              :placeholder="streamStatus?.hasSecret ? t('settings.asrKeySaved') : t('settings.asrSecretPlaceholder')"
            />
          </div>

          <p v-if="streamFeedback" class="feedback" :class="streamFeedback.ok ? 'ok' : 'err'">{{ streamFeedback.text }}</p>

          <div v-if="asrDirty" class="actions">
            <button class="reset-btn" @click="resetAsrStream">{{ t('settings.reset') }}</button>
            <button class="save-btn" :disabled="streamSaving" @click="saveAsrStream">{{ streamSaving ? t('settings.saving') : t('common.save') }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'web' }" @click="toggleSection('web')">
          {{ t('settings.webSearch') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'web'" class="section-body">
          <p class="hint">{{ t('settings.webSearchHint') }}</p>

          <div class="field">
            <label class="label">{{ t('settings.webSearchKey') }}</label>
            <input
              v-model="webApiKey"
              class="input"
              type="password"
              spellcheck="false"
              :placeholder="webStatus?.hasKey ? t('settings.webSearchKeySaved') : t('settings.webSearchKeyPlaceholder')"
            />
          </div>

          <p v-if="webFeedback" class="feedback" :class="webFeedback.ok ? 'ok' : 'err'">{{ webFeedback.text }}</p>

          <div v-if="webDirty" class="actions">
            <button class="reset-btn" @click="resetWebSearch">{{ t('settings.reset') }}</button>
            <button class="save-btn" :disabled="webSaving" @click="saveWebSearch">{{ webSaving ? t('settings.saving') : t('common.save') }}</button>
          </div>
          <div v-else-if="webStatus?.hasKey" class="actions">
            <button class="reset-btn danger" :disabled="webSaving" @click="clearWebSearch">{{ t('settings.webSearchClear') }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'limits' }" @click="toggleSection('limits')">
          {{ t('settings.limits') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'limits'" class="section-body">
          <p class="hint">{{ t('settings.limitsHint') }}</p>

          <div class="field">
            <label class="label">{{ t('settings.limitsOverall') }}</label>
            <input v-model.number="overallMin" class="input" type="number" min="1" max="1440" :placeholder="t('settings.limitsOverallPlaceholder')" />
          </div>

          <div class="field">
            <label class="label">{{ t('settings.limitsMember') }}</label>
            <input v-model.number="memberMin" class="input" type="number" min="1" max="120" :placeholder="t('settings.limitsMemberPlaceholder')" />
          </div>

          <p v-if="limitsFeedback" class="feedback" :class="limitsFeedback.ok ? 'ok' : 'err'">{{ limitsFeedback.text }}</p>

          <div v-if="limitsDirty" class="actions">
            <button class="reset-btn" :disabled="limitsSaving" @click="resetLimits">{{ t('settings.reset') }}</button>
            <button class="save-btn" :disabled="limitsSaving" @click="saveLimits">{{ limitsSaving ? t('settings.saving') : t('common.save') }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'compression' }" @click="toggleSection('compression')">
          {{ t('settings.compression') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'compression'" class="section-body">
          <p class="hint">{{ t('settings.compressionHint') }}</p>

          <button class="setting-row" @click="compressionEnabled = !compressionEnabled">
            <span class="row-info">
              <span class="row-name">{{ t('settings.compressionEnabled') }}</span>
              <span class="row-desc">{{ t('settings.compressionEnabledDesc') }}</span>
            </span>
            <span class="switch" :class="{ on: compressionEnabled }"><span class="knob"></span></span>
          </button>

          <div class="field">
            <label class="label">{{ t('settings.compressionBudget') }}</label>
            <input
              v-model.number="compressionBudget"
              class="input"
              type="number"
              min="5000"
              max="500000"
              :disabled="!compressionEnabled"
              :placeholder="t('settings.compressionBudgetPlaceholder')"
            />
          </div>

          <p v-if="compressionFeedback" class="feedback" :class="compressionFeedback.ok ? 'ok' : 'err'">{{ compressionFeedback.text }}</p>

          <div v-if="compressionDirty" class="actions">
            <button class="reset-btn" :disabled="compressionSaving" @click="resetCompression">{{ t('settings.reset') }}</button>
            <button class="save-btn" :disabled="compressionSaving" @click="saveCompression">{{ compressionSaving ? t('settings.saving') : t('common.save') }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" :class="{ clickable: true, open: openSection === 'browser' }" @click="toggleSection('browser')">
          {{ t('settings.browser') }}
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </h3>
        <div v-show="openSection === 'browser'" class="section-body">
          <p class="hint">{{ t('settings.browserHint') }}</p>

          <button class="setting-row" @click="browserHeadless = !browserHeadless">
            <span class="row-info">
              <span class="row-name">{{ t('settings.browserHeadless') }}</span>
              <span class="row-desc">{{ t('settings.browserHeadlessDesc') }}</span>
            </span>
            <span class="switch" :class="{ on: browserHeadless }"><span class="knob"></span></span>
          </button>

          <button class="setting-row" @click="browserPersistLogin = !browserPersistLogin">
            <span class="row-info">
              <span class="row-name">{{ t('settings.browserPersistLogin') }}</span>
              <span class="row-desc">{{ t('settings.browserPersistLoginDesc') }}</span>
            </span>
            <span class="switch" :class="{ on: browserPersistLogin }"><span class="knob"></span></span>
          </button>

          <div class="wl-block">
            <p class="row-name">{{ t('settings.browserWhitelist') }}</p>
            <p class="row-desc">{{ t('settings.browserWhitelistDesc') }}</p>
            <div class="wl-add">
              <input
                v-model="browserNewDomain"
                class="wl-input"
                :placeholder="t('settings.browserWhitelistPlaceholder')"
                @keydown.enter.prevent="addBrowserDomain"
              />
              <button class="reset-btn" :disabled="!browserNewDomain.trim()" @click="addBrowserDomain">{{ t('settings.browserWhitelistAdd') }}</button>
            </div>
            <p v-if="browserWhitelist.length === 0" class="wl-empty">{{ t('settings.browserWhitelistEmpty') }}</p>
            <div v-else class="wl-list">
              <span v-for="d in browserWhitelist" :key="d" class="wl-item">
                {{ d }}
                <button class="wl-remove" :title="t('settings.delete')" @click="removeBrowserDomain(d)">×</button>
              </span>
            </div>
          </div>

          <p v-if="browserFeedback" class="feedback" :class="browserFeedback.ok ? 'ok' : 'err'">{{ browserFeedback.text }}</p>

          <div v-if="browserDirty" class="actions">
            <button class="reset-btn" :disabled="browserSaving" @click="resetBrowser">{{ t('settings.reset') }}</button>
            <button class="save-btn" :disabled="browserSaving" @click="saveBrowser">{{ browserSaving ? t('settings.saving') : t('common.save') }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title">{{ t('settings.data') }}</h3>
        <p class="hint">{{ t('settings.dataHint') }}</p>

        <p v-if="backupFeedback" class="feedback" :class="backupFeedback.ok ? 'ok' : 'err'">{{ backupFeedback.text }}</p>

        <div class="actions actions-start">
          <button class="reset-btn" :disabled="backupBusy || restoreBusy" @click="exportBackup">{{ backupBusy ? t('settings.exporting') : t('settings.export') }}</button>
          <button class="reset-btn" :disabled="backupBusy || restoreBusy" @click="importBackup">{{ restoreBusy ? t('settings.importing') : t('settings.import') }}</button>
          <button class="reset-btn" @click="desktop.openDataDir()">{{ t('settings.openDataDir') }}</button>
          <button class="reset-btn" @click="showLogs = true">{{ t('settings.viewLogs') }}</button>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title">{{ t('settings.about') }}</h3>

        <div class="about-row">
          <span class="about-label">{{ t('settings.version') }}</span>
          <button class="version-btn" :title="t('settings.changelog')" @click="showChangelog = true">
            v{{ APP_VERSION }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div class="about-row">
          <span class="about-label">{{ t('settings.source') }}</span>
          <button class="link-btn" :title="t('settings.sourceTip')" @click="openExternal(GITHUB_REPO_URL)">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            guyu0327/agent-team-desktop
          </button>
        </div>

        <div class="about-row">
          <span class="about-label">{{ t('settings.blog') }}</span>
          <button class="link-btn" :title="t('settings.blogTip')" @click="openExternal(CSDN_BLOG_URL)">
            <svg class="csdn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h8M8 17h5" />
            </svg>
            {{ t('settings.blogLink') }}
          </button>
        </div>
      </section>
    </div>

    <ChangelogModal v-if="showChangelog" @close="showChangelog = false" />
    <LogsModal v-if="showLogs" @close="showLogs = false" />
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
  margin-top: $spacing-lg;
  padding-top: $spacing-lg;
  border-top: 1px solid $border-light;
}

.section-title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: $spacing-sm;

  &.clickable {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    cursor: pointer;
    user-select: none;

    &:hover {
      color: $primary-color;
    }

    .chev {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      transition: transform 0.18s ease;
    }

    &.open .chev {
      transform: rotate(180deg);
    }
  }
}

.setting-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  width: 100%;
  padding: $spacing-sm;
  border-radius: $radius-sm;
  text-align: left;

  &:hover:not(:disabled) {
    background: $bg-panel-hover;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .row-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row-name {
    font-size: $font-size-base;
    color: $text-primary;
  }

  .row-desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: $radius-sm;
  background: $bg-input;
  flex-shrink: 0;

  .seg-btn {
    padding: 4px $spacing-lg;
    border-radius: 2px;
    font-size: $font-size-sm;
    color: $text-secondary;
    cursor: pointer;
    white-space: nowrap;
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      color: $text-primary;
    }

    &.on {
      background: $bg-panel;
      color: $text-primary;
      box-shadow: $shadow-sm;
    }
  }
}

.switch {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: $border-color;
  position: relative;
  transition: background $transition-fast;
  flex-shrink: 0;

  &.on {
    background: $primary-color;
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform $transition-fast;
  }

  &.on .knob {
    transform: translateX(18px);
  }
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

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
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
}

.dir-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: $spacing-sm;
}

.dir-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: 6px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  border: 1px solid $border-color;

  .dir-icon {
    width: 15px;
    height: 15px;
    color: #fbbc54;
    flex-shrink: 0;
  }

  .dir-path {
    flex: 1;
    min-width: 0;
    font-size: $font-size-sm;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.row-btn {
  padding: 3px $spacing-md;
  border-radius: $radius-sm;
  font-size: $font-size-xs;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  flex-shrink: 0;
  transition: background $transition-fast, color $transition-fast;

  &:hover {
    background: $bg-hover;
    color: $text-primary;
  }

  &.danger:hover {
    background: rgba(250, 81, 81, 0.12);
    color: #fa5151;
  }
}

.dir-empty {
  padding: $spacing-sm 0;
  font-size: $font-size-xs;
  color: $text-tertiary;
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

.wl-block {
  margin-bottom: $spacing-md;

  .row-name {
    display: block;
    font-size: $font-size-sm;
    color: $text-primary;
  }

  .row-desc {
    display: block;
    font-size: $font-size-xs;
    color: $text-tertiary;
    margin: 2px 0 $spacing-sm;
    line-height: 1.5;
  }
}

.wl-add {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

.wl-input {
  flex: 1;
  padding: 6px $spacing-sm;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  outline: none;

  &:focus {
    border-color: $primary-color;
  }
}

.wl-empty {
  font-size: $font-size-xs;
  color: $text-tertiary;
}

.wl-list {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-xs;
}

.wl-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px $spacing-sm;
  border-radius: $radius-sm;
  background: $bg-input;
  border: 1px solid $border-color;
  font-size: $font-size-xs;
  color: $text-secondary;
  font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
}

.wl-remove {
  border: none;
  background: none;
  color: $text-tertiary;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;

  &:hover {
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
  transition: background $transition-fast, color $transition-fast;

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &.danger:hover:not(:disabled) {
    background: rgba(250, 81, 81, 0.12);
    color: #fa5151;
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
