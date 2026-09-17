import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Agent, AgentDraft } from '@/types'
import { createAgent, deleteAgent, listAgents, updateAgent } from '@/api/agent'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([])

  async function loadAgents() {
    agents.value = await listAgents()
  }

  function getById(id: string): Agent | undefined {
    return agents.value.find((a) => a.id === id)
  }

  async function addAgent(draft: AgentDraft): Promise<Agent> {
    const agent = await createAgent(draft)
    agents.value.push(agent)
    return agent
  }

  async function updateAgentById(id: string, draft: AgentDraft): Promise<Agent> {
    const agent = await updateAgent(id, draft)
    const idx = agents.value.findIndex((a) => a.id === id)
    if (idx !== -1) agents.value[idx] = agent
    return agent
  }

  async function removeAgent(id: string) {
    await deleteAgent(id)
    agents.value = agents.value.filter((a) => a.id !== id)
  }

  return { agents, getById, loadAgents, addAgent, updateAgentById, removeAgent }
})
