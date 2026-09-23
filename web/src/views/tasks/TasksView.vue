<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Conversation, ScheduledTask } from '@/types'
import { useConversationStore } from '@/stores/conversation'
import { useAgentStore } from '@/stores/agent'
import { deleteConversationTasks, deleteTask, listTaskGroups, runTaskNow, updateConversationTaskStatus, updateTask } from '@/api/tasks'
import { confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { exportConversation } from '@/utils/chatExport'
import { t } from '@/i18n'
import SearchBar from '@/components/common/SearchBar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import ConversationItem from '@/views/message/components/ConversationItem.vue'
import TaskFormModal from './components/TaskFormModal.vue'

const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const agentStore = useAgentStore()

const keyword = ref('')
/** 新建（null）或编辑（任务对象）共用同一个表单弹窗 */
const showForm = ref(false)
const formTask = ref<ScheduledTask | null>(null)
/** 会话 -> 其下任务（左侧子列表用），进行中在前、暂停次之、已完成最后 */
const tasksByConv = ref<Record<string, ScheduledTask[]>>({})
/** 已展开任务子列表的会话 */
const expanded = ref(new Set<string>())

const STATUS_WEIGHT: Record<ScheduledTask['status'], number> = { active: 0, paused: 1, done: 2 }

async function refreshTasks() {
  try {
    const groups = await listTaskGroups()
    const map: Record<string, ScheduledTask[]> = {}
    for (const g of groups) {
      map[g.conversation.id] = [...g.tasks].sort(
        (a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status],
      )
    }
    tasksByConv.value = map
  } catch {
    /* 刷新失败保留旧数据 */
  }
}

onMounted(() => {
  conversationStore.loadTaskConversations().catch(() => {})
  refreshTasks()
})

// 流式回合结束/任务操作后 store 会重拉任务会话列表，子列表借机同步（AI 新建的任务也能及时出现）
watch(() => conversationStore.taskConversations, () => refreshTasks())

function displayOf(c: Conversation): { name: string; avatar: string } {
  if (c.type === 'group') return { name: c.name, avatar: '👥' }
  const agent = c.agentId ? agentStore.getById(c.agentId) : undefined
  return { name: agent?.name ?? t('message.deletedAgent'), avatar: agent?.avatar ?? '' }
}

/** 协作任务群名字后的状态标签（群本身就是一个任务），颜色与任务子项的状态文字一致 */
function groupBadge(c: Conversation): { label: string; cls: string } | undefined {
  const task = tasksByConv.value[c.id]?.[0]
  if (!task) return undefined
  if (task.status === 'active') return { label: t('tasks.statusActive'), cls: 'st-active' }
  if (task.status === 'paused') return { label: t('tasks.statusPaused'), cls: 'st-paused' }
  return { label: t('tasks.statusDone'), cls: 'st-done' }
}

const filteredConversations = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const list = conversationStore.taskConversations
  if (!q) return list
  return list.filter((c) => displayOf(c).name.toLowerCase().includes(q))
})

const activeId = computed(() => (route.name === 'TaskChat' ? (route.params.id as string) : null))
const activeFilter = computed(() =>
  typeof route.query.task === 'string' && route.query.task ? route.query.task : null,
)

// 深链/新建任务跳转进来时自动展开对应主体
watch(activeId, (id) => {
  if (id) expanded.value.add(id)
}, { immediate: true })

/** 点击主体：选中并展开；再次点击收起。协作任务群本身就是一个任务，无子列表可展开 */
function onMainClick(c: Conversation) {
  if (c.type === 'group') return
  if (c.id === activeId.value && !activeFilter.value && expanded.value.has(c.id)) {
    expanded.value.delete(c.id)
  } else {
    expanded.value.add(c.id)
  }
}

function selectTask(task: ScheduledTask) {
  router.push({ path: `/tasks/${task.conversationId}`, query: { task: task.id } })
}

// 主体右键：批量恢复 / 暂停 / 删除该主体的全部任务（按当前状态给出可用项）
// 协作任务群本身就是一个任务，右键直接给单任务菜单而非批量菜单
const convCtx = ref<{ x: number; y: number; conv: Conversation } | null>(null)

function onConvContextMenu(c: Conversation, e: MouseEvent) {
  if (c.type === 'group') {
    const task = tasksByConv.value[c.id]?.[0]
    if (task) taskCtx.value = { x: e.clientX, y: e.clientY, task }
    return
  }
  convCtx.value = { x: e.clientX, y: e.clientY, conv: c }
}

/** 右键菜单与页头「⋯」一致：导出 + 批量恢复/暂停 + 删除所有，顺序按 不影响数据→更新→删除 */
const convCtxItems = computed(() => {
  const conv = convCtx.value?.conv
  const list = conv ? (tasksByConv.value[conv.id] ?? []) : []
  if (list.length === 0) return []
  const items: { key: string; label: string; danger?: boolean }[] = [
    { key: 'export', label: t('chat.exportChat') },
  ]
  if (list.some((task) => task.status === 'paused')) {
    items.push({ key: 'resume-all', label: t('tasks.resumeAll') })
  }
  if (list.some((task) => task.status === 'active')) {
    items.push({ key: 'pause-all', label: t('tasks.pauseAll') })
  }
  items.push({ key: 'delete-all', label: t('tasks.deleteAll'), danger: true })
  return items
})

function onConvCtxSelect(key: string) {
  const conv = convCtx.value?.conv
  convCtx.value = null
  if (!conv) return
  if (key === 'export') exportConversation(conv, 'task')
  else if (key === 'pause-all') bulkStatus(conv, 'paused')
  else if (key === 'resume-all') bulkStatus(conv, 'active')
  else if (key === 'delete-all') bulkDelete(conv)
}

async function bulkStatus(conv: Conversation, status: 'active' | 'paused') {
  try {
    await updateConversationTaskStatus(conv.id, status)
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function bulkDelete(conv: Conversation) {
  const ok = await confirmAction({
    title: t('tasks.deleteAll'),
    message: t('tasks.deleteAllMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await deleteConversationTasks(conv.id)
    // 任务删光后主体从列表消失，正在查看时回到空态
    if (activeId.value === conv.id) router.push('/tasks')
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

// 任务子项右键：编辑 / 暂停(恢复) / 删除，与右上角按钮一致
const taskCtx = ref<{ x: number; y: number; task: ScheduledTask } | null>(null)

const taskCtxItems = computed(() => {
  const task = taskCtx.value?.task
  if (!task) return []
  const items: { key: string; label: string; danger?: boolean }[] = [
    { key: 'run', label: t('tasks.runNow') },
    { key: 'export', label: t('chat.exportChat') },
    { key: 'edit', label: t('tasks.edit') },
  ]
  if (task.status !== 'done') {
    items.push({
      key: 'pause',
      label: task.status === 'paused' ? t('tasks.resume') : t('tasks.pause'),
    })
  }
  items.push({ key: 'delete', label: t('common.delete'), danger: true })
  return items
})

function onTaskCtxSelect(key: string) {
  const task = taskCtx.value?.task
  taskCtx.value = null
  if (!task) return
  if (key === 'run') {
    runTask(task)
  } else if (key === 'export') {
    const conv = conversationStore.findConv(task.conversationId)
    if (conv) exportConversation(conv, 'task')
  } else if (key === 'edit') {
    formTask.value = task
    showForm.value = true
  } else if (key === 'pause') {
    togglePause(task)
  } else if (key === 'delete') {
    removeTask(task)
  }
}

async function runTask(task: ScheduledTask) {
  try {
    await runTaskNow(task.id)
    showToast(t('tasks.runTriggered'))
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function togglePause(task: ScheduledTask) {
  try {
    await updateTask(task.id, { status: task.status === 'paused' ? 'active' : 'paused' })
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function removeTask(task: ScheduledTask) {
  const ok = await confirmAction({
    title: t('common.delete'),
    message: t('tasks.deleteMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await deleteTask(task.id)
    // 删除的是当前筛选中的任务时，回到该主体的全部消息
    if (activeFilter.value === task.id) router.push(`/tasks/${task.conversationId}`)
    refreshTasks()
    // 任务删光时主体会从列表消失，重拉列表同步
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function onFormSaved(conversationId: string) {
  const created = !formTask.value
  showForm.value = false
  formTask.value = null
  await refreshTasks()
  conversationStore.loadTaskConversations().catch(() => {})
  if (created) router.push(`/tasks/${conversationId}`)
}
</script>

<template>
  <div class="tasks-module">
    <aside class="list-panel">
      <div class="panel-header drag-region">
        <SearchBar v-model="keyword" class="search" />
        <button class="icon-btn" :title="t('tasks.new')" @click="formTask = null; showForm = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </button>
      </div>
      <div class="conversation-list">
        <template v-for="c in filteredConversations" :key="c.id">
          <router-link
            :to="`/tasks/${c.id}`"
            class="conversation-link"
            @click="onMainClick(c)"
            @contextmenu.prevent="onConvContextMenu(c, $event)"
          >
            <span v-if="c.type !== 'group'" class="caret" :class="{ open: expanded.has(c.id), on: c.id === activeId }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
            <ConversationItem
              :conversation="c"
              :name="displayOf(c).name"
              :avatar="displayOf(c).avatar"
              :active="c.id === activeId"
              :typing="conversationStore.isTyping(c.id)"
              :badge="c.type === 'group' ? groupBadge(c)?.label : undefined"
              :badge-class="c.type === 'group' ? groupBadge(c)?.cls : undefined"
            />
          </router-link>
          <div v-if="c.type !== 'group' && expanded.has(c.id)" class="task-children">
            <button
              v-for="task in tasksByConv[c.id] ?? []"
              :key="task.id"
              class="task-row"
              :class="{ active: task.id === activeFilter }"
              :title="task.name"
              @click="selectTask(task)"
              @contextmenu.prevent="taskCtx = { x: $event.clientX, y: $event.clientY, task }"
            >
              <span class="task-name">{{ task.name }}</span>
              <span v-if="task.status === 'active'" class="task-status running">{{ t('tasks.statusActive') }}</span>
              <span v-else-if="task.status === 'paused'" class="task-status paused">{{ t('tasks.statusPaused') }}</span>
              <span v-else-if="task.status === 'done'" class="task-status done">{{ t('tasks.statusDone') }}</span>
            </button>
          </div>
        </template>
        <div v-if="filteredConversations.length === 0" class="empty">
          <p>{{ t('tasks.empty') }}</p>
          <p class="hint">{{ t('tasks.emptyHint') }}</p>
        </div>
        <ContextMenu
          v-if="taskCtx"
          :x="taskCtx.x"
          :y="taskCtx.y"
          :items="taskCtxItems"
          @select="onTaskCtxSelect"
          @close="taskCtx = null"
        />
        <ContextMenu
          v-if="convCtx"
          :x="convCtx.x"
          :y="convCtx.y"
          :items="convCtxItems"
          @select="onConvCtxSelect"
          @close="convCtx = null"
        />
      </div>
    </aside>
    <section class="content-area">
      <div class="task-body">
        <router-view />
      </div>
    </section>

    <TaskFormModal v-if="showForm" :task="formTask ?? undefined" @close="showForm = false" @saved="onFormSaved" />
  </div>
</template>

<style scoped lang="scss">
.tasks-module {
  display: flex;
  height: 100%;
  width: 100%;
}

.list-panel {
  width: $panel-width;
  flex-shrink: 0;
  background: $bg-panel;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;

  .search {
    flex: 1;
    min-width: 0;
  }
}

.icon-btn {
  width: 32px;
  height: 32px;
  margin-right: $spacing-md;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: $bg-panel-hover;
    color: $text-primary;
  }
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: $spacing-sm;

  .conversation-link {
    position: relative;
    display: block;
  }

  // 协作任务群的状态徽标配色与下方任务子项的状态文字一致
  :deep(.badge-tag) {
    &.st-active {
      background: rgba(52, 211, 153, 0.14);
      color: #34d399;
    }

    &.st-paused {
      background: rgba(250, 157, 59, 0.14);
      color: #fa9d3b;
    }

    &.st-done {
      background: rgba(148, 163, 184, 0.14);
      color: $text-tertiary;
    }
  }

  .caret {
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    color: $text-tertiary;
    pointer-events: none;
    transition: transform $transition-fast, color $transition-fast;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 12px;
      height: 12px;
    }

    &.open {
      transform: translateY(-50%) rotate(90deg);
    }

    &.on {
      color: rgba(255, 255, 255, 0.85);
    }
  }

  .task-children {
    display: flex;
    flex-direction: column;
    padding: 2px 0 $spacing-xs;
  }

  .task-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: 7px $spacing-md 7px 50px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background $transition-fast, color $transition-fast;

    .task-name {
      flex: 1;
      min-width: 0;
      font-size: $font-size-sm;
      color: $text-secondary;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-status {
      flex-shrink: 0;
      font-size: $font-size-xs;
      color: $text-tertiary;

      &.running {
        color: #34d399;
      }

      &.paused {
        color: #fa9d3b;
      }

      &.done {
        opacity: 0.7;
      }
    }

    &:hover {
      background: $bg-panel-hover;

      .task-name {
        color: $text-primary;
      }
    }

    &.active {
      background: rgba(var(--c-primary-rgb), 0.12);

      .task-name {
        color: $primary-color;
        font-weight: 500;
      }
    }
  }

  .empty {
    padding: $spacing-xxl $spacing-lg;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-size-sm;

    .hint {
      margin-top: $spacing-sm;
      font-size: $font-size-xs;
      opacity: 0.7;
    }
  }
}

.content-area {
  flex: 1;
  min-width: 0;
  background: $bg-content;
  display: flex;
  flex-direction: column;
}

.task-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
