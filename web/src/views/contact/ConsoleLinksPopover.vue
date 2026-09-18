<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'

const emit = defineEmits<{ close: [] }>()

const CONSOLES = computed<{ name: string; desc: string; url: string }[]>(() => [
  { name: 'DeepSeek', desc: 'deepseek-chat / deepseek-reasoner', url: 'https://platform.deepseek.com/' },
  { name: t('console.bailian'), desc: t('console.bailianDesc'), url: 'https://bailian.console.aliyun.com/' },
  { name: t('console.siliconflow'), desc: t('console.siliconflowDesc'), url: 'https://cloud.siliconflow.cn/' },
  { name: t('console.zhipu'), desc: t('console.zhipuDesc'), url: 'https://open.bigmodel.cn/' },
  { name: t('console.moonshot'), desc: t('console.moonshotDesc'), url: 'https://platform.moonshot.cn/' },
  { name: t('console.volcengine'), desc: t('console.volcengineDesc'), url: 'https://console.volcengine.com/ark' },
  { name: t('console.xfyun'), desc: t('console.xfyunDesc'), url: 'https://console.xfyun.cn/' },
  { name: 'OpenAI', desc: 'gpt', url: 'https://platform.openai.com/' },
  { name: 'Anthropic', desc: 'claude', url: 'https://console.anthropic.com/' },
  { name: 'Google AI Studio', desc: 'gemini', url: 'https://aistudio.google.com/' },
])

function open(c: { name: string; url: string }) {
  window.open(c.url, '_blank', 'noopener')
  emit('close')
}
</script>

<template>
  <div class="popover-mask" @click="emit('close')">
    <div class="console-pop" @click.stop>
      <h3 class="console-title">{{ t('models.console') }}</h3>
      <p class="console-subtitle">{{ t('console.subtitle') }}</p>
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
// 透明点击层：点卡片外任意处关闭；卡片锚定「模型控制台」按钮右侧（内容区方向）弹出
.popover-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.console-pop {
  position: fixed;
  bottom: 8px;
  left: 324px;
  width: 340px;
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
  max-height: min(420px, 60vh);
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
