<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

const CONSOLES: { name: string; desc: string; url: string }[] = [
  { name: 'DeepSeek', desc: 'deepseek-chat / deepseek-reasoner', url: 'https://platform.deepseek.com/' },
  { name: '阿里云百炼', desc: 'qwen 系列、DashScope 文生图', url: 'https://bailian.console.aliyun.com/' },
  { name: '硅基流动', desc: 'Qwen-Image / Kolors 等聚合平台', url: 'https://cloud.siliconflow.cn/' },
  { name: '智谱 AI', desc: 'glm-4 系列', url: 'https://open.bigmodel.cn/' },
  { name: '月之暗面', desc: 'kimi 系列', url: 'https://platform.moonshot.cn/' },
  { name: '火山方舟', desc: '豆包系列', url: 'https://console.volcengine.com/ark' },
  { name: '讯飞开放平台', desc: '星火模型 / 语音听写', url: 'https://console.xfyun.cn/' },
  { name: 'OpenAI', desc: 'gpt 系列', url: 'https://platform.openai.com/' },
  { name: 'Anthropic', desc: 'claude 系列', url: 'https://console.anthropic.com/' },
  { name: 'Google AI Studio', desc: 'gemini 系列', url: 'https://aistudio.google.com/' },
]

function open(c: { name: string; url: string }) {
  window.open(c.url, '_blank', 'noopener')
  emit('close')
}
</script>

<template>
  <div class="console-mask" @click.self="emit('close')">
    <div class="console-card">
      <h3 class="console-title">模型控制台</h3>
      <p class="console-subtitle">点击跳转到对应平台的控制台（系统浏览器打开）</p>
      <div class="console-list">
        <button v-for="c in CONSOLES" :key="c.url" type="button" class="console-item" @click="open(c)">
          <span class="console-info">
            <span class="name">{{ c.name }}</span>
            <span class="desc">{{ c.desc }}</span>
          </span>
          <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6M10 14L21 3" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.console-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.console-card {
  width: 360px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-lg;
}

.console-title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
}

.console-subtitle {
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  color: $text-tertiary;
}

.console-list {
  margin-top: $spacing-md;
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.console-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: 8px $spacing-md;
  border-radius: $radius-sm;
  text-align: left;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;

    .link-icon {
      color: $primary-color;
    }
  }

  .console-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-size: $font-size-sm;
    color: $text-primary;
  }

  .desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .link-icon {
    width: 16px;
    height: 16px;
    color: $text-tertiary;
    flex-shrink: 0;
    transition: color $transition-fast;
  }
}
</style>
