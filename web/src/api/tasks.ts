import type { ScheduledTask, TaskDraft, TaskGroup } from '@/types'
import { request } from './http'

/** 任务页数据：按会话分组的全部定时任务（无任务的会话不出现） */
export function listTaskGroups(): Promise<TaskGroup[]> {
  return request('/tasks')
}

/** 某会话的全部任务（管理弹窗） */
export function listTasksOfConversation(conversationId: string): Promise<ScheduledTask[]> {
  return request(`/tasks/conversation/${conversationId}`)
}

export function createTask(draft: TaskDraft): Promise<ScheduledTask> {
  return request('/tasks', { method: 'POST', body: draft })
}

/** 从历史归档恢复定时任务（按归档会话上的任务快照重建） */
export function restoreArchivedTask(conversationId: string): Promise<ScheduledTask> {
  return request(`/tasks/restore/${conversationId}`, { method: 'POST' })
}

export function updateTask(taskId: string, draft: Partial<TaskDraft>): Promise<ScheduledTask> {
  return request(`/tasks/${taskId}`, { method: 'PUT', body: draft })
}

export function deleteTask(taskId: string): Promise<void> {
  return request(`/tasks/${taskId}`, { method: 'DELETE' })
}

/** 立即执行一次（手动触发与到点相同的流程） */
export function runTaskNow(taskId: string): Promise<ScheduledTask> {
  return request(`/tasks/${taskId}/run`, { method: 'POST' })
}

/** 批量暂停/恢复某主体的全部任务（done 状态不受影响），返回受影响数量 */
export function updateConversationTaskStatus(
  conversationId: string,
  status: 'active' | 'paused',
): Promise<number> {
  return request(`/tasks/conversations/${conversationId}/status`, { method: 'PUT', body: { status } })
}

/** 删除某主体的全部任务（逐个归档到历史记录） */
export function deleteConversationTasks(conversationId: string): Promise<void> {
  return request(`/tasks/conversations/${conversationId}`, { method: 'DELETE' })
}
