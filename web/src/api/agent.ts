import type { Agent, AgentDraft } from '@/types'
import { request } from './http'

export function listAgents(): Promise<Agent[]> {
  return request('/agents')
}

export function createAgent(draft: AgentDraft): Promise<Agent> {
  return request('/agents', { method: 'POST', body: draft })
}

export function updateAgent(id: string, draft: AgentDraft): Promise<Agent> {
  return request(`/agents/${id}`, { method: 'PUT', body: draft })
}

export function deleteAgent(id: string): Promise<void> {
  return request(`/agents/${id}`, { method: 'DELETE' })
}
