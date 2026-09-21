<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import {
  cancelWechatLogin,
  disconnectWechat,
  getWechatLoginState,
  getWechatStatus,
  startWechatLogin,
  submitWechatVerifyCode,
  updateWechatSettings,
  type WechatLoginState,
  type WechatStatus,
} from '@/api/wechat'
import { confirmAction } from '@/composables/confirm'
import { t } from '@/i18n'

const emit = defineEmits<{ close: [] }>()

const agentStore = useAgentStore()
const status = ref<WechatStatus | null>(null)
const login = ref<WechatLoginState | null>(null)
const verifyCode = ref('')
const busy = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const connected = computed(() => !!status.value?.connected)

const agentId = ref('')
const autoWrite = ref(false)
const autoShell = ref(false)
const receiveEnabled = ref(true)

function fill(s: WechatStatus) {
  status.value = s
  agentId.value = s.agentId
  autoWrite.value = s.autoWrite
  autoShell.value = s.autoShell
  receiveEnabled.value = s.enabled
}

async function refresh() {
  try {
    fill(await getWechatStatus())
  } catch {
    /* 打开时读取失败保持空态 */
  }
}

/** 配置项点按即生效（每次全量提交，未在弹层暴露的字段原样回传） */
async function saveConfig() {
  if (!status.value || busy.value) return
  busy.value = true
  try {
    fill(
      await updateWechatSettings({
        enabled: receiveEnabled.value,
        agentId: agentId.value,
        autoWrite: autoWrite.value,
        autoShell: autoShell.value,
        maxReplyChars: status.value.maxReplyChars,
        roundTimeoutMinutes: status.value.roundTimeoutMinutes,
      }),
    )
  } catch {
    /* 保存失败保持本地选择，下次修改一并提交 */
  } finally {
    busy.value = false
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function beginLogin() {
  const s = login.value?.status
  if (s === 'qr_ready' || s === 'scaned' || s === 'need_verifycode') return
  try {
    login.value = await startWechatLogin()
  } catch {
    login.value = { status: 'failed', qrSvg: null, error: t('settings.wechatLoginFailed'), botId: null }
  }
  startPoll()
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(async () => {
    if (!login.value) {
      stopPoll()
      return
    }
    try {
      const s = await getWechatLoginState()
      login.value = s
      if (s.status === 'confirmed') {
        stopPoll()
        login.value = null
        await refresh()
      } else if (s.status === 'failed' || s.status === 'idle') {
        stopPoll()
      }
    } catch {
      /* 单次轮询失败忽略，下一轮重试 */
    }
  }, 1500)
}

async function submitVerify() {
  if (!verifyCode.value.trim()) return
  try {
    login.value = await submitWechatVerifyCode(verifyCode.value.trim())
    verifyCode.value = ''
  } catch {
    /* 配对码错误时后台状态机会停留在 need_verifycode，等下一轮重试 */
  }
}

async function disconnectChan() {
  const ok = await confirmAction({
    title: t('settings.wechatDisconnectTitle'),
    message: t('settings.wechatDisconnectMsg'),
    confirmText: t('settings.wechatDisconnect'),
    danger: true,
  })
  if (!ok) return
  try {
    fill(await disconnectWechat())
  } catch {
    /* 断开失败保持原状态 */
  }
  await beginLogin()
}

onMounted(async () => {
  await refresh()
  agentStore.loadAgents().catch(() => {
    /* 列表读取失败不阻塞弹层 */
  })
  if (status.value && !status.value.connected) {
    await beginLogin()
  }
})

onUnmounted(async () => {
  stopPoll()
  if (login.value) {
    const s = login.value.status
    login.value = null
    if (s === 'qr_ready' || s === 'scaned' || s === 'need_verifycode') {
      try {
        await cancelWechatLogin()
      } catch {
        /* 后台线程有 5 分钟超时兜底 */
      }
    }
  }
})
</script>

<template>
  <div class="popover-mask" @click="emit('close')">
    <div class="wechat-pop" @click.stop>
      <div class="head">
        <svg class="head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M11 18h2" />
        </svg>
        <span class="head-title">{{ t('settings.wechat') }}</span>
        <span class="state" :class="{ on: connected }">{{ connected ? t('settings.wechatConfirmed') : t('settings.wechatNotConnected') }}</span>
      </div>

      <p class="hint">{{ t('settings.wechatHint') }}</p>

      <!-- 未连接：二维码登录 -->
      <template v-if="!connected">
        <div v-if="login?.qrSvg" class="qr-wrap">
          <img :src="login.qrSvg" class="qr-img" :alt="t('settings.wechatScan')" />
          <p v-if="login.status === 'scaned'" class="qr-status ok">{{ t('settings.wechatScanned') }}</p>
          <p v-else class="qr-status">{{ t('settings.wechatQrReady') }}</p>
        </div>
        <template v-else-if="login?.status === 'need_verifycode'">
          <p class="qr-status">{{ t('settings.wechatVerifyHint') }}</p>
          <div class="verify-row">
            <input v-model="verifyCode" class="input verify-input" type="text" inputmode="numeric" @keyup.enter="submitVerify" />
            <button class="btn primary" @click="submitVerify">{{ t('common.ok') }}</button>
          </div>
        </template>
        <p v-else-if="login?.status === 'failed'" class="qr-status err">{{ login.error || t('settings.wechatLoginFailed') }}</p>
        <p v-else class="qr-status">{{ t('settings.wechatLoginPreparing') }}</p>

        <button
          v-if="login?.status === 'failed' || (!login?.qrSvg && login?.status !== 'need_verifycode')"
          class="btn"
          @click="beginLogin"
        >
          {{ t('settings.wechatRetry') }}
        </button>
      </template>

      <!-- 已连接：信息 + 断开 -->
      <template v-else>
        <div class="info-row">
          <span class="info-label">{{ t('settings.wechatBotId') }}</span>
          <span class="info-value" :title="status?.botId ?? ''">{{ status?.botId }}</span>
        </div>

        <button class="row" @click="receiveEnabled = !receiveEnabled; saveConfig()">
          <span class="row-info">
            <span class="row-name">{{ t('settings.wechatEnabled') }}</span>
            <span class="row-desc">{{ t('settings.wechatEnabledDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: receiveEnabled }"><span class="knob"></span></span>
        </button>

        <div class="field">
          <label class="label">{{ t('settings.wechatAgent') }}</label>
          <select v-model="agentId" class="input" @change="saveConfig">
            <option value="">{{ t('settings.wechatAgentAuto') }}</option>
            <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>

        <button class="row" @click="autoWrite = !autoWrite; saveConfig()">
          <span class="row-info">
            <span class="row-name">{{ t('settings.wechatAutoWrite') }}</span>
            <span class="row-desc">{{ t('settings.wechatAutoWriteDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: autoWrite }"><span class="knob"></span></span>
        </button>

        <button class="row" @click="autoShell = !autoShell; saveConfig()">
          <span class="row-info">
            <span class="row-name">{{ t('settings.wechatAutoShell') }}</span>
            <span class="row-desc">{{ t('settings.wechatAutoShellDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: autoShell }"><span class="knob"></span></span>
        </button>

        <button class="disconnect-btn" @click="disconnectChan">{{ t('settings.wechatDisconnect') }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 透明点击层：点卡片外任意处关闭；卡片锚定侧栏底部微信入口右侧
.popover-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.wechat-pop {
  position: fixed;
  left: 66px;
  bottom: 16px;
  width: 300px;
  max-height: 80vh;
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

.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-sm;

  .qr-img {
    width: 208px;
    height: 208px;
    border-radius: $radius-sm;
  }
}

.qr-status {
  font-size: $font-size-sm;
  color: $text-secondary;
  line-height: 1.6;

  &.ok {
    color: #34d399;
  }

  &.err {
    color: #fa5151;
  }
}

.verify-row {
  display: flex;
  gap: $spacing-sm;

  .verify-input {
    flex: 1;
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

.field {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;

  .label {
    font-size: $font-size-sm;
    color: $text-secondary;
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
    color: $text-white;

    &:hover {
      background: $primary-hover;
    }
  }
}

.disconnect-btn {
  margin-top: $spacing-xs;
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  background: rgba(250, 81, 81, 0.1);
  color: #fa5151;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: rgba(250, 81, 81, 0.18);
  }
}
</style>
