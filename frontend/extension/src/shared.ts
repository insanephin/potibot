import type { SongRequest, SpotifyAccount } from '@/api/dashboard'

export const apiOrigin = __API_ORIGIN__

export type AuthProvider = 'chzzk' | 'spotify'

export type AuthResult = { provider: AuthProvider; error?: string }

export type ExtensionMessage =
  { type: 'login'; provider: AuthProvider } | { type: 'get-pending-requests' } | { type: 'get-status' }

export type PendingRequestsResponse = { requests: SongRequest[] }

export type StatusResponse =
  { signedIn: false } | { signedIn: true; channelName: string | null; spotify: SpotifyAccount }

export const storageKeys = { token: 'token', authResult: 'authResult' } as const

export async function readSessionToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(storageKeys.token)
  return (stored[storageKeys.token] as string | undefined) ?? null
}
