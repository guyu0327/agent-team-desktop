<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/i18n'
import type { AskRequest } from '@/types'
import Avatar from './Avatar.vue'

const props = defineProps<{ ask: AskRequest }>()
const emit = defineEmits<{ (e: 'answer', ask: AskRequest, text: string): void }>()

const otherText = ref('')

function pick(option: string) {
  emit('answer', props.ask, option)
}

function submitOther() {
  const text = otherText.value.trim()
  if (!text) return
  emit('answer', props.ask, text)
}
</script>

<template>
  <div class="ask-card">
    <div class="ask-head">
      <Avatar :name="ask.agentName" :size="16" />
      <span class="ask-title">「{{ ask.agentName }}」{{ t('chat.askHint') }}</span>
    </div>
    <!-- 问题是不带框的加粗正文，与下方可选的选项行拉开层次 -->
    <div class="ask-question">{{ ask.question }}</div>
    <div v-if="ask.options.length > 0" class="ask-options">
      <button v-for="(opt, i) in ask.options" :key="opt" class="ask-option" @click="pick(opt)">
        <span class="opt-mark">{{ String.fromCharCode(65 + i) }}</span>
        <span class="opt-text">{{ opt }}</span>
      </button>
    </div>
    <div class="ask-other">
      <span class="other-label">{{ t('chat.askOtherLabel') }}</span>
      <input
        v-model="otherText"
        class="ask-input"
        :placeholder="t('chat.askInputPlaceholder')"
        autofocus
        @keydown.enter="submitOther"
      />
      <button class="ask-send" :disabled="!otherText.trim()" @click="submitOther">{{ t('chat.askSend') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.ask-card {
  border: 1px solid rgba($primary-color, 0.35);
  border-radius: $radius-md;
  background: $bg-panel;
  padding: $spacing-sm $spacing-md;
}

.ask-head {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  color: $primary-color;

  .ask-title {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $primary-color;
  }
}

.ask-question {
  margin-top: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 600;
  line-height: 1.6;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

.ask-options {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: $spacing-xs;
  margin-top: $spacing-sm;
}

.ask-option {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  text-align: left;
  padding: 6px $spacing-md;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  line-height: 1.45;
  cursor: pointer;
  transition: border-color $transition-fast, background $transition-fast;

  .opt-mark {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border: 1px solid $border-color;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: $text-tertiary;
    transition: border-color $transition-fast, color $transition-fast;
  }

  &:hover {
    border-color: $primary-color;
    background: rgba($primary-color, 0.06);

    .opt-mark {
      border-color: $primary-color;
      color: $primary-color;
    }
  }
}

.ask-other {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-top: $spacing-xs;

  .other-label {
    flex-shrink: 0;
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .ask-input {
    flex: 1;
    padding: 5px $spacing-md;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: $bg-input;
    color: $text-primary;
    font-size: $font-size-sm;

    &:focus {
      outline: none;
      border-color: $primary-color;
    }
  }

  .ask-send {
    padding: 5px $spacing-lg;
    border: 1px solid $primary-color;
    border-radius: $radius-sm;
    background: $primary-color;
    color: $text-white;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: background $transition-fast;

    &:hover {
      background: $primary-hover;
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }
}
</style>
