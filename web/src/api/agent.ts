import type { Agent, AgentAutoFillDraft, AgentDraft } from '@/types'
import { request } from './http'

export function listAgents(): Promise<Agent[]> {
  return request('/agents')
}

export function createAgent(draft: AgentDraft): Promise<Agent> {
  return request('/agents', { method: 'POST', body: draft })
}

/** 一句话自动生成智能体基础配置，presetId 指定用于生成的对话模型 */
export function autoFillAgent(prompt: string, presetId: string): Promise<AgentAutoFillDraft> {
  return request('/agents/auto-fill', { method: 'POST', body: { prompt, presetId } })
}

export function updateAgent(id: string, draft: AgentDraft): Promise<Agent> {
  return request(`/agents/${id}`, { method: 'PUT', body: draft })
}

export function deleteAgent(id: string): Promise<void> {
  return request(`/agents/${id}`, { method: 'DELETE' })
}
