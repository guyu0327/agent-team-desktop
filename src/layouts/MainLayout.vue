<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import { useConversationStore } from '@/stores/conversation'
import Avatar from '@/components/common/Avatar.vue'
import ConfirmHost from '@/components/common/ConfirmHost.vue'

const userStore = useUserStore()
const conversationStore = useConversationStore()
</script>

<template>
  <div class="main-layout">
    <aside class="sidebar">
      <router-link to="/profile" class="avatar-link" active-class="active" title="我的">
        <Avatar :name="userStore.user?.name ?? '我'" :avatar="userStore.user?.avatar" :size="36" />
      </router-link>

      <nav class="nav">
        <router-link to="/chat" class="nav-item" active-class="active" title="消息">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 3C6.48 3 2 6.94 2 11.75c0 2.66 1.4 5.04 3.62 6.65-.12.83-.5 2.1-1.12 3.1 0 0 2.3-.2 4.12-1.4.74.16 1.52.25 2.33.25h.05c5.52 0 10-3.94 10-8.75S17.52 3 12 3z"
            />
          </svg>
          <span v-if="conversationStore.totalUnread > 0" class="nav-badge">
            {{ conversationStore.totalUnread > 99 ? '99+' : conversationStore.totalUnread }}
          </span>
        </router-link>
        <router-link to="/contact" class="nav-item" active-class="active" title="通讯录">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            />
          </svg>
        </router-link>
        <router-link to="/models" class="nav-item" active-class="active" title="模型">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="14" height="14" rx="2" />
            <rect x="10" y="10" width="4" height="4" />
            <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
          </svg>
        </router-link>
      </nav>

      <div class="sidebar-bottom">
        <router-link to="/settings" class="nav-item" active-class="active" title="设置">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </router-link>
      </div>
    </aside>

    <main class="module">
      <router-view />
    </main>

    <ConfirmHost />
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

.sidebar {
  width: $sidebar-width;
  background: $bg-sidebar;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $spacing-lg 0 $spacing-md;
  flex-shrink: 0;

  .avatar-link {
    border-radius: $radius-sm;
    outline: 2px solid transparent;
    outline-offset: 1px;
    transition: outline-color $transition-fast;

    &.active {
      outline-color: $primary-color;
    }
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: $spacing-lg;
    margin-top: $spacing-xxl;
  }
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: $radius-md;
  color: #8a8a8a;
  cursor: pointer;
  transition: color $transition-fast, background $transition-fast;

  .nav-badge {
    position: absolute;
    top: -4px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #fa5151;
    color: $text-white;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
  }

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    color: #c8c8c8;
  }

  &.active {
    color: $primary-color;
  }
}

.module {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
