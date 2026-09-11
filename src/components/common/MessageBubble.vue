<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/types'
import Avatar from '@/components/common/Avatar.vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  message: Message
  self?: boolean
  senderName: string
  senderAvatar?: string
  /** 发送者标识徽标，如编排者的「编排者」 */
  badge?: string
  typing?: boolean
}>()

/** 只有智能体消息走 Markdown 渲染；自己消息和错误提示保持纯文本 */
const rendered = computed(() => renderMarkdown(props.message.content))
</script>

<template>
  <div class="message-bubble" :class="{ self }">
    <Avatar :name="senderName" :avatar="senderAvatar" :size="36" />
    <div class="bubble-col">
      <span v-if="badge" class="badge">{{ badge }}</span>
      <div class="bubble" :class="{ error: message.type === 'error' }">
        <div v-if="typing && !message.content" class="typing">
          <span></span><span></span><span></span>
        </div>
        <div v-else-if="message.type === 'image'" class="image-placeholder">[图片]</div>
        <span v-else-if="self || message.type === 'error'" class="plain">{{ message.content }}</span>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="md" v-html="rendered"></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message-bubble {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  max-width: 70%;

  &.self {
    flex-direction: row-reverse;
    align-self: flex-end;

    .bubble {
      background: $bg-bubble-self;
      color: $text-white;
      border-radius: $radius-md 2px $radius-md $radius-md;
    }
  }
}

.bubble-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  .badge {
    align-self: flex-start;
    width: fit-content;
    font-size: $font-size-xs;
    line-height: 1;
    padding: 3px 7px;
    border-radius: $radius-sm;
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.08);
  }
}

.self .bubble-col .badge {
  align-self: flex-end;
}

.bubble {
  padding: 10px $spacing-md;
  background: $bg-bubble-other;
  color: $text-primary;
  border-radius: 2px $radius-md $radius-md $radius-md;
  font-size: $font-size-base;
  line-height: 1.5;
  word-break: break-word;

  &.error {
    background: rgba(250, 81, 81, 0.12);
    border: 1px solid rgba(250, 81, 81, 0.35);
    color: #ff9c9c;
  }

  .plain {
    white-space: pre-wrap;
  }

  .md {
    :deep(p) {
      margin: 0.5em 0;
    }

    :deep(> p:first-child) {
      margin-top: 0;
    }

    :deep(> p:last-child) {
      margin-bottom: 0;
    }

    $headings: (h1, h2, h3, h4, h5, h6);
    @each $h in $headings {
      :deep(#{$h}) {
        margin: 0.6em 0 0.3em;
        font-size: $font-size-base;
        font-weight: 600;
        line-height: 1.4;
      }

      :deep(#{$h}:first-child) {
        margin-top: 0;
      }
    }

    :deep(h1) {
      font-size: 1.15em;
    }

    :deep(h2) {
      font-size: 1.1em;
    }

    :deep(h3) {
      font-size: 1.05em;
    }

    :deep(ul) {
      margin: 0.3em 0;
      padding-left: 1.4em;
    }

    :deep(ol) {
      margin: 0.3em 0;
      padding-left: 1.4em;
    }

    :deep(li) {
      margin: 0.15em 0;
    }

    :deep(li > p) {
      margin: 0;
    }

    :deep(code) {
      padding: 1px 5px;
      border-radius: $radius-sm;
      background: rgba(255, 255, 255, 0.1);
      font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
      font-size: 0.9em;
    }

    :deep(pre) {
      margin: 0.5em 0;
      padding: $spacing-md;
      border-radius: $radius-sm;
      background: rgba(0, 0, 0, 0.35);
      overflow-x: auto;
    }

    :deep(pre code) {
      padding: 0;
      background: none;
      font-size: 0.88em;
      line-height: 1.6;
    }

    :deep(blockquote) {
      margin: 0.4em 0;
      padding: 0.1em 0.8em;
      border-left: 3px solid rgba(255, 255, 255, 0.2);
      color: $text-secondary;
    }

    :deep(blockquote p) {
      margin: 0.2em 0;
    }

    :deep(a) {
      color: $primary-color;
    }

    :deep(a:hover) {
      text-decoration: underline;
    }

    :deep(table) {
      margin: 0.5em 0;
      border-collapse: collapse;
      display: block;
      max-width: 100%;
      overflow-x: auto;
    }

    :deep(th) {
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 4px 10px;
      text-align: left;
      background: rgba(255, 255, 255, 0.06);
    }

    :deep(td) {
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 4px 10px;
      text-align: left;
    }

    :deep(hr) {
      margin: 0.6em 0;
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }

    :deep(img) {
      max-width: 100%;
      border-radius: $radius-sm;
    }
  }
}

.typing {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 3px 0;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $text-tertiary;
    animation: typing-blink 1.2s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typing-blink {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 80px;
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.08);
  color: $text-secondary;
  font-size: $font-size-sm;
}

.self .image-placeholder {
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.85);
}
</style>
