export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`Request failed: ${status}`)
    this.status = status
    this.body = body
  }
}

// Cached in memory, not persisted -- fetched lazily on the first non-GET
// request of a page load (or re-fetched if a prior one is ever rejected).
// Tied to the session, not to a signed-in user, so this works before login
// too (see Auth::CsrfController).
let csrfToken: string | null = null

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: 'include' })
  const body = (await res.json()) as { csrf_token: string }
  csrfToken = body.csrf_token
  return csrfToken
}

// Registered once by RequireAuth so a 401 on any request (session expired,
// logged out in another tab, etc.) clears cached data and bounces to
// /login -- except for the auth endpoints themselves, where a 401 just
// means "wrong password," not "your session is gone."
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()

  if (method !== 'GET' && !csrfToken) {
    await fetchCsrfToken()
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    onUnauthorized?.()
  }

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // non-JSON or empty error body (e.g. a 404 with no rescue_from)
    }
    throw new ApiError(res.status, body)
  }

  if (res.status === 204 || res.status === 202) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export const apiGet = <T,>(path: string) => request<T>(path)

export const apiPost = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const apiPatch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

export const apiDelete = (path: string) => request<void>(path, { method: 'DELETE' })
