<script setup lang="ts">
import type { Conversation } from '@/types'
import Avatar from '@/components/common/Avatar.vue'
import { formatConversationTime } from '@/utils/time'
import { t } from '@/i18n'

defineProps<{
  conversation: Conversation
  name: string
  avatar: string
  active?: boolean
  typing?: boolean
  pinned?: boolean
  /** 名称后的附加标签（如历史记录的「定时任务」） */
  badge?: string
  /** 附加标签的着色类（如任务状态的运行/暂停/完成） */
  badgeClass?: string
}>()
</script>

<template>
  <div class="conversation-item" :class="{ active }">
    <div class="avatar-wrap">
      <Avatar :name="name" :avatar="avatar" :size="40" />
      <span v-if="conversation.unreadCount > 0" class="badge">
        {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
      </span>
    </div>
    <div class="info">
      <div class="row">
        <span class="name-wrap">
          <span class="name">{{ name }}</span>
          <span v-if="badge" class="badge-tag" :class="badgeClass">{{ badge }}</span>
        </span>
        <span v-if="pinned" class="pin" :title="t('conv.pinned')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
            />
          </svg>
        </span>
        <span class="time">{{ formatConversationTime(conversation.lastMessageTime) }}</span>
      </div>
      <div class="row">
        <span class="last-message" :class="{ typing }">
          {{ typing ? t('conv.typing') : conversation.lastMessage || t('conv.start') }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.conversation-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.active {
    background: $primary-color;

    .name,
    .last-message,
    .time,
    .pin {
      color: $text-white;
    }

    .badge-tag {
      color: $text-white;
      background: rgba(255, 255, 255, 0.22);
    }

    &:hover {
      background: $primary-color;
    }
  }
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;

  .badge {
    position: absolute;
    top: -5px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #fa5151;
    color: $text-white;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    box-sizing: border-box;
  }
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

.name-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.name {
  font-size: $font-size-base;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(var(--c-primary-rgb), 0.14);
  color: $primary-color;
  font-size: 10px;
  line-height: 1.5;
}

.time {
  font-size: $font-size-xs;
  color: $text-tertiary;
  flex-shrink: 0;
}

.pin {
  display: flex;
  flex-shrink: 0;

  svg {
    width: 12px;
    height: 12px;
  }
}

.last-message {
  font-size: $font-size-sm;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.typing {
    color: $primary-color;
  }
}
</style>
