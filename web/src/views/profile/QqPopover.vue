<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useAgentStore } from '@/stores/agent'
import {
  disconnectQq,
  getQqStatus,
  pollQqQr,
  saveQqCredential,
  startQqQr,
  updateQqSettings,
  type QqChannelSettings,
  type QqStatus,
} from '@/api/qq'
import { confirmAction } from '@/composables/confirm'
import { t } from '@/i18n'

const emit = defineEmits<{ close: [] }>()

const agentStore = useAgentStore()
const status = ref<QqStatus | null>(null)
const busy = ref(false)

// 凭据表单输入（扫码/手动两种绑定方式共用「保存并连接」）
const appIdInput = ref('')
const appSecretInput = ref('')
const credError = ref('')

// 弹层视图：qr 扫码绑定 ⇄ cred 手动填写 ⇄ info 已配置的信息与设置页
const view = ref<'qr' | 'cred' | 'info'>('qr')

// 设置编辑态：改动进 form，防抖后自动提交（服务端回填的状态记快照，避免回填再触发保存）
const form = ref<QqChannelSettings | null>(null)
const SAVE_DEBOUNCE_MS = 600
let saveTimer: ReturnType<typeof setTimeout> | null = null
let savedSnapshot = ''

// 扫码绑定：二维码内容由后端建任务返回，completed 后自动保存凭据
const qrImg = ref('')
const qrState = ref<'loading' | 'waiting' | 'error'>('loading')
const qrError = ref('')
let qrTaskId = ''
let qrTimer: ReturnType<typeof setInterval> | null = null

const configured = computed(() => !!status.value?.appId)
const connected = computed(() => !!status.value?.connected)

const POLICIES = ['open', 'whitelist', 'off'] as const

const c2cPolicyItems = computed(() =>
  POLICIES.map((p) => ({ value: p, label: t(`settings.qqPolicy_${p}`) })),
)
const groupPolicyItems = computed(() =>
  POLICIES.map((p) => ({ value: p, label: t(`settings.qqPolicy_${p}`) })),
)

/** 名单编辑器统一描述：key 对应 form 里的数组字段 */
const listDefs = computed(() => {
  if (!form.value) return []
  return [
    {
      key: 'c2cWhitelist' as const,
      label: t('settings.qqC2cWhitelist'),
      desc: t('settings.qqC2cWhitelistDesc'),
      items: form.value.c2cWhitelist,
      suggestions: seenC2c.value,
    },
    {
      key: 'groupWhitelist' as const,
      label: t('settings.qqGroupWhitelist'),
      desc: t('settings.qqGroupWhitelistDesc'),
      items: form.value.groupWhitelist,
      suggestions: seenGroups.value,
    },
  ]
})

/** 最近联系人：私聊按用户、群聊拆成群本体和群成员两个维度 */
const seenC2c = computed(() => (status.value?.seen ?? []).filter((p) => p.kind === 'c2c'))
const seenGroups = computed(() => {
  const out: { openid: string; preview: string }[] = []
  const uniq = new Set<string>()
  for (const p of status.value?.seen ?? []) {
    if (p.kind === 'group' && p.groupOpenid && !uniq.has(p.groupOpenid)) {
      uniq.add(p.groupOpenid)
      out.push({ openid: p.groupOpenid, preview: p.preview })
    }
  }
  return out
})

function fill(s: QqStatus) {
  status.value = s
  form.value = {
    enabled: s.enabled,
    agentId: s.agentId,
    autoWrite: s.autoWrite,
    autoShell: s.autoShell,
    maxReplyChars: s.maxReplyChars,
    roundTimeoutMinutes: s.roundTimeoutMinutes,
    c2cPolicy: s.c2cPolicy,
    c2cWhitelist: [...s.c2cWhitelist],
    groupPolicy: s.groupPolicy,
    groupWhitelist: [...s.groupWhitelist],
  }
  savedSnapshot = JSON.stringify(form.value)
}

watch(
  form,
  (f) => {
    if (!f || JSON.stringify(f) === savedSnapshot) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(autoSave, SAVE_DEBOUNCE_MS)
  },
  { deep: true },
)

async function autoSave() {
  if (!form.value) return
  if (busy.value) {
    // 凭据请求进行中，顺延到空闲再存，避免丢改动
    saveTimer = setTimeout(autoSave, SAVE_DEBOUNCE_MS)
    return
  }
  try {
    fill(await updateQqSettings({ ...form.value }))
  } catch {
    /* 保存失败保持本地编辑，下次改动一并提交 */
  }
}

async function refresh() {
  try {
    fill(await getQqStatus())
  } catch {
    /* 打开时读取失败保持空态 */
  }
}

async function saveCredential() {
  if (busy.value) return
  if (!appIdInput.value.trim() || !appSecretInput.value.trim()) {
    credError.value = t('settings.qqCredentialRequired')
    return
  }
  busy.value = true
  credError.value = ''
  try {
    fill(await saveQqCredential(appIdInput.value.trim(), appSecretInput.value.trim()))
    view.value = 'info'
    appIdInput.value = ''
    appSecretInput.value = ''
  } catch (e) {
    credError.value = e instanceof Error && e.message ? e.message : t('settings.qqConnectFailed')
  } finally {
    busy.value = false
  }
}

async function disconnectChan() {
  const ok = await confirmAction({
    title: t('settings.qqDisconnectTitle'),
    message: t('settings.qqDisconnectMsg'),
    confirmText: t('settings.qqDisconnect'),
    danger: true,
  })
  if (!ok) return
  try {
    fill(await disconnectQq())
  } catch {
    /* 解绑失败保持原状态 */
  }
}

// ---------- 名单编辑 ----------

const draftInputs = ref<Record<string, string>>({ c2cWhitelist: '', groupWhitelist: '' })

function addItem(key: 'c2cWhitelist' | 'groupWhitelist', raw?: string) {
  if (!form.value) return
  const value = (raw ?? draftInputs.value[key] ?? '').trim()
  if (!value) return
  const list = [...form.value[key]]
  if (!list.includes(value)) list.push(value)
  form.value = { ...form.value, [key]: list }
  draftInputs.value = { ...draftInputs.value, [key]: '' }
}

function removeItem(key: 'c2cWhitelist' | 'groupWhitelist', value: string) {
  if (!form.value) return
  form.value = { ...form.value, [key]: form.value[key].filter((x) => x !== value) }
}

function suggestionIn(key: 'c2cWhitelist' | 'groupWhitelist', openid: string): boolean {
  return form.value ? form.value[key].includes(openid) : false
}

function tailOf(openid: string): string {
  return openid.length <= 8 ? openid : openid.slice(-8)
}

// ---------- 扫码绑定 ----------

/** 进入扫码视图并（重）生成二维码；切走时由 watch 停轮询 */
async function openQr() {
  view.value = 'qr'
  await createQrTask()
}

async function createQrTask() {
  stopQrPolling()
  qrState.value = 'loading'
  qrError.value = ''
  try {
    const { taskId, qrUrl } = await startQqQr()
    qrTaskId = taskId
    qrImg.value = await QRCode.toDataURL(qrUrl, { margin: 1, width: 220 })
    qrState.value = 'waiting'
    // 平台对轮询接口有限频（实测 2s 一击中），放慢到 5s，扫码场景感知无差
    qrTimer = setInterval(pollQrOnce, 5000)
  } catch (e) {
    qrState.value = 'error'
    qrError.value = e instanceof Error && e.message ? e.message : t('settings.qqConnectFailed')
  }
}

async function pollQrOnce() {
  try {
    const r = await pollQqQr(qrTaskId)
    if (r.status === 'completed') {
      stopQrPolling()
      await applyQrCredential(r.appId, r.appSecret, r.ownerOpenid)
    } else if (r.status === 'expired') {
      // 平台任务过期自动换新码，用户无感
      await createQrTask()
    }
  } catch {
    /* 单次轮询失败继续下一轮 */
  }
}

/** 扫码成功：凭据后端验证并保存（扫码人记为机主）；失败则切到手动表单带着凭据重试 */
async function applyQrCredential(appId: string, appSecret: string, ownerOpenid: string) {
  try {
    fill(await saveQqCredential(appId, appSecret, ownerOpenid))
    view.value = 'info'
  } catch (e) {
    view.value = 'cred'
    appIdInput.value = appId
    appSecretInput.value = appSecret
    credError.value = e instanceof Error && e.message ? e.message : t('settings.qqConnectFailed')
  }
}

function stopQrPolling() {
  if (qrTimer) {
    clearInterval(qrTimer)
    qrTimer = null
  }
}

// 离开扫码视图即停轮询，后台不再空转
watch(view, (v) => {
  if (v !== 'qr') stopQrPolling()
})

onMounted(async () => {
  await refresh()
  // 未配置默认扫码接入，已配置停在信息页
  if (configured.value) {
    view.value = 'info'
  } else {
    await openQr()
  }
  agentStore.loadAgents().catch(() => {
    /* 列表读取失败不阻塞弹层 */
  })
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  stopQrPolling()
})
</script>

<template>
  <div class="popover-mask" @click="emit('close')">
    <div class="qq-pop" @click.stop>
      <div class="head">
        <svg class="head-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"
          />
        </svg>
        <span class="head-title">{{ t('settings.qq') }}</span>
        <span v-if="configured" class="state" :class="{ on: connected }">
          {{ connected ? t('settings.qqOnline') : t('settings.qqOffline') }}
        </span>
      </div>

      <p class="hint">{{ t('settings.qqHint') }}</p>

      <!-- 扫码视图：建任务出二维码，手机 QQ 扫码确认后凭据自动保存 -->
      <div v-if="view === 'qr'" class="qr-box">
        <template v-if="qrState === 'loading'">
          <p class="qr-status">{{ t('settings.qqQrLoading') }}</p>
        </template>
        <template v-else-if="qrState === 'error'">
          <p class="cred-err">{{ qrError }}</p>
        </template>
        <template v-else>
          <img class="qr-img" :src="qrImg" alt="QQ" />
          <p class="qr-status">{{ t('settings.qqQrWaiting') }}</p>
        </template>
        <div class="qr-actions">
          <button class="mini-btn" @click="createQrTask">{{ t('settings.qqQrRefresh') }}</button>
          <button class="mini-btn" @click="view = 'cred'">{{ t('settings.qqManualFill') }}</button>
          <button v-if="configured" class="mini-btn" @click="view = 'info'">{{ t('common.cancel') }}</button>
        </div>
      </div>

      <!-- 手动填写视图：与扫码互切 -->
      <template v-else-if="view === 'cred'">
        <div class="field">
          <label class="label">{{ t('settings.qqAppId') }}</label>
          <input v-model="appIdInput" class="input" type="text" :placeholder="t('settings.qqAppIdPh')" />
        </div>
        <div class="field">
          <label class="label">{{ t('settings.qqAppSecret') }}</label>
          <input v-model="appSecretInput" class="input" type="password" :placeholder="t('settings.qqAppSecretPh')" />
        </div>
        <p v-if="credError" class="cred-err">{{ credError }}</p>
        <div class="btn-row">
          <button class="btn primary" :disabled="busy" @click="saveCredential">
            {{ t('settings.qqConnect') }}
          </button>
          <button class="btn" @click="openQr">{{ t('settings.qqQrBind') }}</button>
        </div>
        <button v-if="configured" class="btn" @click="view = 'info'">
          {{ t('common.cancel') }}
        </button>
      </template>

      <!-- 已配置：凭据信息 + 通道设置 + 访问控制 -->
      <template v-else-if="form">
        <div class="info-row">
          <span class="info-label">{{ t('settings.qqBotAppId') }}</span>
          <span class="info-value" :title="status?.appId ?? ''">{{ status?.appId }}</span>
        </div>
        <div class="cred-actions">
          <button class="mini-btn" @click="view = 'cred'">{{ t('settings.qqReplaceCredential') }}</button>
          <button class="mini-btn" @click="openQr">{{ t('settings.qqQrReplace') }}</button>
          <button class="mini-btn danger" @click="disconnectChan">{{ t('settings.qqDisconnect') }}</button>
        </div>

        <button class="row" @click="form.enabled = !form.enabled">
          <span class="row-info">
            <span class="row-name">{{ t('settings.qqEnabled') }}</span>
            <span class="row-desc">{{ t('settings.qqEnabledDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: form.enabled }"><span class="knob"></span></span>
        </button>

        <div class="field">
          <label class="label">{{ t('settings.qqAgent') }}</label>
          <select v-model="form.agentId" class="input">
            <option value="">{{ t('settings.qqAgentAuto') }}</option>
            <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>

        <button class="row" @click="form.autoWrite = !form.autoWrite">
          <span class="row-info">
            <span class="row-name">{{ t('settings.qqAutoWrite') }}</span>
            <span class="row-desc">{{ t('settings.qqAutoWriteDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: form.autoWrite }"><span class="knob"></span></span>
        </button>

        <button class="row" @click="form.autoShell = !form.autoShell">
          <span class="row-info">
            <span class="row-name">{{ t('settings.qqAutoShell') }}</span>
            <span class="row-desc">{{ t('settings.qqAutoShellDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: form.autoShell }"><span class="knob"></span></span>
        </button>

        <!-- 访问控制：谁能指挥 AI（私聊三档 / 群聊三档+双名单） -->
        <div class="section-title">{{ t('settings.qqAccess') }}</div>

        <div class="field">
          <label class="label">{{ t('settings.qqC2cPolicy') }}</label>
          <div class="seg">
            <button
              v-for="p in c2cPolicyItems"
              :key="p.value"
              class="seg-item"
              :class="{ on: form.c2cPolicy === p.value }"
              @click="form.c2cPolicy = p.value"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="label">{{ t('settings.qqGroupPolicy') }}</label>
          <div class="seg">
            <button
              v-for="p in groupPolicyItems"
              :key="p.value"
              class="seg-item"
              :class="{ on: form.groupPolicy === p.value }"
              @click="form.groupPolicy = p.value"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <template v-for="def in listDefs" :key="def.key">
          <div class="field">
            <label class="label">{{ def.label }}</label>
            <p class="label-desc">{{ def.desc }}</p>
            <div v-if="def.items.length" class="tags">
              <span v-for="item in def.items" :key="item" class="tag">
                {{ tailOf(item) }}
                <button class="tag-x" :title="item" @click="removeItem(def.key, item)">×</button>
              </span>
            </div>
            <div class="add-row">
              <input
                v-model="draftInputs[def.key]"
                class="input"
                type="text"
                :placeholder="t('settings.qqAddPlaceholder')"
                @keyup.enter="addItem(def.key)"
              />
              <button class="mini-btn" @click="addItem(def.key)">{{ t('settings.qqAdd') }}</button>
            </div>
            <div v-if="def.suggestions.length" class="suggestions">
              <div class="suggestions-title">{{ t('settings.qqFromSeen') }}</div>
              <button
                v-for="sug in def.suggestions.slice(0, 6)"
                :key="def.key + sug.openid"
                class="sug-row"
                :class="{ on: suggestionIn(def.key, sug.openid) }"
                :title="sug.openid"
                @click="suggestionIn(def.key, sug.openid) ? removeItem(def.key, sug.openid) : addItem(def.key, sug.openid)"
              >
                <span class="sug-tail">{{ tailOf(sug.openid) }}</span>
                <span class="sug-preview">{{ sug.preview }}</span>
              </button>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 透明点击层：点卡片外任意处关闭；卡片锚定侧栏底部 QQ 入口右侧
.popover-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.qq-pop {
  position: fixed;
  left: 66px;
  bottom: 16px;
  width: 320px;
  max-height: 84vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  padding: $spacing-xl;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;

  .head {
    display: flex;
    align-items: center;
    gap: $spacing-sm;

    .head-icon {
      width: 20px;
      height: 20px;
      color: $text-primary;
      flex-shrink: 0;
    }

    .head-title {
      flex: 1;
      font-size: $font-size-lg;
      font-weight: 600;
      color: $text-primary;
    }

    .state {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: $font-size-xs;
      color: $text-tertiary;

      &::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: $border-color;
      }

      &.on {
        color: #34d399;

        &::before {
          background: #34d399;
        }
      }
    }
  }

  .hint {
    font-size: $font-size-xs;
    color: $text-tertiary;
    line-height: 1.6;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;

  .label {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .label-desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
    line-height: 1.5;
  }
}

.input {
  width: 100%;
  padding: 8px $spacing-md;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;
  outline: none;

  &:focus {
    border-color: $primary-color;
  }
}

.btn {
  padding: 7px $spacing-xl;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }

  &.primary {
    background: $primary-color;
    color: #fff;

    &:hover {
      background: $primary-hover;
    }
  }
}

.cred-err {
  font-size: $font-size-xs;
  color: #fa5151;
  line-height: 1.5;
}

.btn-row {
  display: flex;
  gap: $spacing-sm;

  .btn {
    flex: 1;
    padding-left: $spacing-md;
    padding-right: $spacing-md;
    white-space: nowrap;
  }
}

.qr-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-md;
  border: 1px dashed $border-color;
  border-radius: $radius-md;

  .qr-img {
    width: 200px;
    height: 200px;
    background: #fff;
    border-radius: $radius-sm;
  }

  .qr-status {
    font-size: $font-size-xs;
    color: $text-tertiary;
    line-height: 1.6;
    text-align: center;
  }

  .qr-actions {
    display: flex;
    gap: $spacing-sm;
  }
}

.info-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;

  .info-label {
    flex-shrink: 0;
    font-size: $font-size-sm;
    color: $text-tertiary;
  }

  .info-value {
    flex: 1;
    min-width: 0;
    font-size: $font-size-sm;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.cred-actions {
  display: flex;
  gap: $spacing-sm;
}

.mini-btn {
  padding: 4px 10px;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: transparent;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.danger {
    color: #fa5151;
    border-color: rgba(250, 81, 81, 0.4);

    &:hover {
      background: rgba(250, 81, 81, 0.1);
    }
  }
}

.row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  width: 100%;
  padding: $spacing-sm;
  border-radius: $radius-sm;
  text-align: left;

  &:hover {
    background: $bg-panel-hover;
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

.section-title {
  margin-top: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-primary;
}

.seg {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: $radius-sm;
  background: $bg-input;

  .seg-item {
    flex: 1;
    padding: 5px 0;
    border-radius: $radius-sm - 1;
    font-size: $font-size-xs;
    color: $text-secondary;
    transition: background $transition-fast;

    &:hover {
      color: $text-primary;
    }

    &.on {
      background: $primary-color;
      color: #fff;
    }
  }
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px 2px 8px;
    border-radius: $radius-sm;
    background: $bg-input;
    font-size: $font-size-xs;
    color: $text-primary;

    .tag-x {
      padding: 0 4px;
      font-size: $font-size-sm;
      color: $text-tertiary;
      cursor: pointer;

      &:hover {
        color: #fa5151;
      }
    }
  }
}

.add-row {
  display: flex;
  gap: $spacing-sm;

  .input {
    flex: 1;
    padding: 5px $spacing-md;
    font-size: $font-size-xs;
  }
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .suggestions-title {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .sug-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: 3px 6px;
    border-radius: $radius-sm - 1;
    text-align: left;

    &:hover {
      background: $bg-panel-hover;
    }

    &.on {
      background: rgba(0, 0, 0, 0.04);
      opacity: 0.55;
    }

    .sug-tail {
      flex-shrink: 0;
      font-size: $font-size-xs;
      color: $text-primary;
      font-family: monospace;
    }

    .sug-preview {
      flex: 1;
      min-width: 0;
      font-size: $font-size-xs;
      color: $text-tertiary;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}
</style>
