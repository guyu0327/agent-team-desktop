import type { ModelPreset, ModelPresetDraft, ModelPresetTestResult } from '@/types'
import { request } from './http'

export function listModelPresets(): Promise<ModelPreset[]> {
  return request('/model-presets')
}

export function createModelPreset(draft: ModelPresetDraft): Promise<ModelPreset> {
  return request('/model-presets', { method: 'POST', body: draft })
}

export function updateModelPreset(id: string, draft: ModelPresetDraft): Promise<ModelPreset> {
  return request(`/model-presets/${id}`, { method: 'PUT', body: draft })
}

export function deleteModelPreset(id: string): Promise<void> {
  return request(`/model-presets/${id}`, { method: 'DELETE' })
}

/** 用表单当前值（可未保存）测试连通性；编辑态 apiKey 留空时后端回落库内已存密钥 */
export function testModelPreset(data: {
  presetId?: string
  name: string
  protocol: string
  baseUrl: string
  apiKey: string
}): Promise<ModelPresetTestResult> {
  return request('/model-presets/test', { method: 'POST', body: data })
}

/** 批量应用到智能体：对话预设写 presetId，文生图预设写 imagePresetId */
export function applyModelPresetToAgents(id: string, agentIds: string[]): Promise<{ applied: number }> {
  return request(`/model-presets/${id}/apply-agents`, { method: 'POST', body: { agentIds } })
}
