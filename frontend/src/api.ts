const BASE = '/api'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options
  let url = BASE + path
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Tidak dapat menghubungi server. Pastikan backend berjalan.', 0)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ??
      `Permintaan gagal (HTTP ${response.status})`
    throw new ApiError(message, response.status)
  }

  return data as T
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ?? {} }),
}
