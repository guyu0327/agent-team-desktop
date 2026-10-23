<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/i18n'
import type { AskRequest } from '@/types'
import Avatar from './Avatar.vue'

const props = defineProps<{ ask: AskRequest }>()
const emit = defineEmits<{ (e: 'answer', ask: AskRequest, text: string): void }>()

const otherText = ref('')
const showOther = ref(false)

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
    <div class="ask-question">{{ ask.question }}</div>
    <div v-if="ask.options.length > 0" class="ask-options">
      <button v-for="opt in ask.options" :key="opt" class="ask-option" @click="pick(opt)">{{ opt }}</button>
    </div>
    <div class="ask-other">
      <button v-if="!showOther" class="ask-option muted" @click="showOther = true">{{ t('chat.askOther') }}</button>
      <template v-else>
        <input
          v-model="otherText"
          class="ask-input"
          :placeholder="t('chat.askInputPlaceholder')"
          autofocus
          @keydown.enter="submitOther"
        />
        <button class="ask-send" :disabled="!otherText.trim()" @click="submitOther">{{ t('chat.askSend') }}</button>
      </template>
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
    color: $text-primary;
  }
}

.ask-question {
  margin-top: $spacing-xs;
  padding: $spacing-sm;
  border-radius: $radius-sm;
  background: $bg-input;
  border: 1px solid $border-color;
  font-size: $font-size-sm;
  line-height: 1.5;
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
  text-align: left;
  padding: 5px $spacing-lg;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  line-height: 1.45;
  cursor: pointer;
  transition: border-color $transition-fast, background $transition-fast;

  &:hover {
    border-color: $primary-color;
    background: rgba($primary-color, 0.06);
  }

  &.muted {
    color: $text-tertiary;
  }
}

.ask-other {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
  margin-top: $spacing-xs;

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
