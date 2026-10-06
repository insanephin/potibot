import type { SongRequest, SpotifyAccount } from '@/api/dashboard'
import type { CurrentUser } from '@/api/user'
import {
  apiOrigin,
  readSessionToken,
  storageKeys,
  type AuthProvider,
  type AuthResult,
  type ExtensionMessage,
  type PendingRequestsResponse,
  type StatusResponse,
} from './shared'

class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined) {
    super(`API ${status}${code ? `: ${code}` : ''}`)
    this.status = status
    this.code = code
  }
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await readSessionToken()
  const response = await fetch(`${apiOrigin}/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) throw new ApiError(response.status, data?.error)
  return data as T
}

async function runLogin(provider: AuthProvider): Promise<AuthResult> {
  const { url } = await api<{ url: string }>(`/${provider}/extension/login`, {
    method: 'POST',
    body: { redirect_uri: chrome.identity.getRedirectURL('auth') },
  })

  let responseUrl: string | undefined
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true })
  } catch {
    return { provider, error: 'cancelled' }
  }
  const params = new URL(responseUrl ?? '').searchParams
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return { provider, error: params.get('error') ?? 'missing_code' }

  if (provider === 'chzzk') {
    const { token } = await api<{ token: string }>('/chzzk/extension/complete', {
      method: 'POST',
      body: { code, state },
    })
    await chrome.storage.local.set({ [storageKeys.token]: token })
  } else {
    await api('/spotify/extension/complete', { method: 'POST', body: { code, state } })
  }
  return { provider }
}

async function login(provider: AuthProvider) {
  let result: AuthResult
  try {
    result = await runLogin(provider)
  } catch (error) {
    console.error(`[auth] ${provider} login failed`, error)
    result = { provider, error: error instanceof ApiError && error.code ? error.code : 'failed' }
  }
  await chrome.storage.session.set({ [storageKeys.authResult]: result })
}

async function getPendingRequests(): Promise<PendingRequestsResponse> {
  if (!(await readSessionToken())) return { requests: [] }
  try {
    return { requests: await api<SongRequest[]>('/dashboard/requests?view=pending') }
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) console.error('[requests] fetch failed', error)
    return { requests: [] }
  }
}

async function getStatus(): Promise<StatusResponse> {
  if (!(await readSessionToken())) return { signedIn: false }
  try {
    const [user, spotify] = await Promise.all([
      api<CurrentUser>('/me'),
      api<SpotifyAccount>('/spotify/account').catch((): SpotifyAccount => ({ connected: false })),
    ])
    return { signedIn: true, channelName: user.channel_name, spotify }
  } catch {
    return { signedIn: false }
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'login') {
    void login(message.provider)
    return false
  }
  if (message.type === 'get-status') {
    void getStatus().then(sendResponse)
    return true
  }
  if (message.type === 'get-pending-requests') {
    void getPendingRequests().then(sendResponse)

    return true
  }
  return false
})
