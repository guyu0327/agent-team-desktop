import { computed, onBeforeUnmount, ref } from 'vue'
import { getAsrStreamSettings } from '@/api/asr'

export type RealtimePhase = 'idle' | 'connecting' | 'streaming'

/**
 * 实时语音转写（讯飞流式听写，经后端 /api/asr/stream 桥接）：
 * 麦克风 → AudioWorklet（线性重采样至 16k、float32→int16、攒 640 样本/1280B 一帧）→ WS。
 * 后端回 {type:partial|final|error|end}；final 为一段（停顿）的完整文本，逐段追加到 finalText。
 */
const WORKLET_SRC = `
class Pcm16kProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.fifo = new Float32Array(16384)
    this.fifoLen = 0
    this.readPos = 0
    this.out = new Int16Array(640)
    this.outLen = 0
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    if (this.fifoLen + input.length <= this.fifo.length) {
      this.fifo.set(input, this.fifoLen)
      this.fifoLen += input.length
    }
    while (this.readPos + 1 < this.fifoLen) {
      const i = Math.floor(this.readPos)
      const frac = this.readPos - i
      const s = this.fifo[i] * (1 - frac) + this.fifo[i + 1] * frac
      const v = Math.max(-1, Math.min(1, s))
      this.out[this.outLen++] = v < 0 ? v * 0x8000 : v * 0x7fff
      this.readPos += this.ratio
      if (this.outLen === 640) {
        this.port.postMessage(this.out.buffer, [this.out.buffer])
        this.out = new Int16Array(640)
        this.outLen = 0
      }
    }
    const i = Math.floor(this.readPos)
    if (i > 0) {
      this.fifo.copyWithin(0, i, this.fifoLen)
      this.fifoLen -= i
      this.readPos -= i
    }
    return true
  }
}
registerProcessor('pcm-16k', Pcm16kProcessor)
`

export function useRealtimeVoice() {
  const phase = ref<RealtimePhase>('idle')
  const partialText = ref('')
  const finalText = ref('')
  const elapsed = ref(0)
  const configured = ref(false)
  /** 已松手/已停止，等后端残余结果（end 或超时）的阶段 */
  const stopping = ref(false)

  const streamText = computed(() => finalText.value + partialText.value)

  let ws: WebSocket | null = null
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let worklet: AudioWorkletNode | null = null
  let micStream: MediaStream | null = null
  let workletUrl: string | null = null
  let ticker: number | null = null
  let endTimer: number | null = null
  let stopped = false
  let onErrorCb: ((message: string) => void) | null = null

  async function refreshConfigured() {
    try {
      const s = await getAsrStreamSettings()
      configured.value = !!(s.appId && s.apiKey && s.apiSecret)
    } catch {
      configured.value = false
    }
  }

  function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      stop()
    }
  }

  function attachEsc() {
    window.addEventListener('keydown', onEsc)
  }

  function detachEsc() {
    window.removeEventListener('keydown', onEsc)
  }

  function teardownAudio() {
    try {
      worklet?.disconnect()
      source?.disconnect()
    } catch {
      /* 已断 */
    }
    worklet = null
    source = null
    micStream?.getTracks().forEach((t) => t.stop())
    micStream = null
    if (ctx) {
      const c = ctx
      ctx = null
      c.close().catch(() => {})
    }
    if (workletUrl) {
      URL.revokeObjectURL(workletUrl)
      workletUrl = null
    }
    if (ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function cleanup() {
    if (endTimer !== null) {
      clearTimeout(endTimer)
      endTimer = null
    }
    detachEsc()
    teardownAudio()
    if (ws) {
      const w = ws
      ws = null
      w.onclose = null
      w.onmessage = null
      try {
        w.close()
      } catch {
        /* 已关 */
      }
    }
    stopping.value = false
    phase.value = 'idle'
  }

  function fail(message: string) {
    const cb = onErrorCb
    cleanup()
    partialText.value = ''
    cb?.(message)
  }

  /** 服务端 end / 停止后 3s 超时：收尾回 idle，已出文字保留在 finalText */
  function finish() {
    if (phase.value === 'idle') return
    cleanup()
    partialText.value = ''
  }

  function handleMessage(ev: MessageEvent) {
    let msg: { type?: string; text?: string; message?: string }
    try {
      msg = JSON.parse(ev.data as string)
    } catch {
      return
    }
    switch (msg.type) {
      case 'partial':
        if (!stopped) partialText.value = msg.text ?? ''
        break
      case 'final':
        finalText.value += msg.text ?? ''
        partialText.value = ''
        break
      case 'error':
        fail(msg.message ?? '实时识别出错')
        break
      case 'end':
        finish()
        break
    }
  }

  async function start(onError?: (message: string) => void) {
    if (phase.value !== 'idle') return
    onErrorCb = onError ?? null
    phase.value = 'connecting'
    finalText.value = ''
    partialText.value = ''
    elapsed.value = 0
    stopped = false
    stopping.value = false
    try {
      if (typeof AudioWorkletNode === 'undefined') {
        throw new Error('当前浏览器不支持实时识别（需要 AudioWorklet 与安全上下文）')
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/asr/stream`)
      ws.binaryType = 'arraybuffer'
      ws.onmessage = handleMessage
      ws.onclose = () => {
        if (ws && phase.value === 'streaming') {
          if (stopped) finish()
          else fail('转写连接已断开，已保留已识别文字')
        }
      }
      await new Promise<void>((resolve, reject) => {
        if (!ws) return reject(new Error('连接已取消'))
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('无法连接实时识别服务'))
      })

      workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
      ctx = new AudioContext({ sampleRate: 16000 })
      if (ctx.state === 'suspended') await ctx.resume()
      await ctx.audioWorklet.addModule(workletUrl)
      source = ctx.createMediaStreamSource(micStream)
      worklet = new AudioWorkletNode(ctx, 'pcm-16k')
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws && ws.readyState === WebSocket.OPEN && !stopped) ws.send(e.data)
      }
      // worklet 必须接入渲染图才会被拉动；经零增益节点到 destination 避免回放
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(worklet)
      worklet.connect(mute)
      mute.connect(ctx.destination)

      phase.value = 'streaming'
      ticker = window.setInterval(() => {
        elapsed.value += 1
      }, 1000)
      attachEsc()
    } catch (e) {
      cleanup()
      partialText.value = ''
      onErrorCb?.(e instanceof Error ? e.message : '实时识别启动失败')
    }
  }

  /** 停止送音并向后端发 stop；等残余结果（end 或 3s 超时）后回 idle */
  function stop() {
    if (phase.value === 'connecting') {
      cleanup()
      partialText.value = ''
      return
    }
    if (phase.value !== 'streaming' || stopping.value) return
    stopped = true
    stopping.value = true
    teardownAudio()
    try {
      ws?.send('{"type":"stop"}')
    } catch {
      /* 已断 */
    }
    endTimer = window.setTimeout(finish, 3000)
  }

  function reset() {
    finalText.value = ''
    partialText.value = ''
  }

  onBeforeUnmount(() => {
    stopped = true
    cleanup()
  })

  return {
    phase,
    partialText,
    finalText,
    streamText,
    elapsed,
    configured,
    stopping,
    refreshConfigured,
    start,
    stop,
    reset,
  }
}
