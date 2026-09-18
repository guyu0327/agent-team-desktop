import { apiHeaders, apiUrl } from './base'
import { t } from '@/i18n'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(`/api${path}`), {
      method: options.method ?? 'GET',
      headers: apiHeaders(options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, t('api.networkError'))
  }

  if (!res.ok) {
    let message = t('api.requestFailed', { code: res.status })
    try {
      const data = await res.json()
      if (typeof data?.message === 'string') message = data.message
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
