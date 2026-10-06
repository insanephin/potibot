import { del, get, post, put } from './client'

type SpotifyAccessStatus = 'none' | 'pending' | 'approved' | 'rejected'

export type SpotifyAccess = {
  status: SpotifyAccessStatus
  email?: string
  requested_at?: string | null
}

export function getSpotifyAccess(): Promise<SpotifyAccess> {
  return get<SpotifyAccess>('/spotify/access')
}

export function requestSpotifyAccess(email: string): Promise<SpotifyAccess> {
  return post<SpotifyAccess>('/spotify/access', { email })
}

export function cancelSpotifyAccess(): Promise<SpotifyAccess> {
  return del<SpotifyAccess>('/spotify/access')
}

export type SpotifyApp = {
  configured: boolean
  client_id: string | null
  redirect_uri: string
}

export function getSpotifyApp(): Promise<SpotifyApp> {
  return get<SpotifyApp>('/spotify/app')
}

export function saveSpotifyApp(clientId: string, clientSecret: string): Promise<SpotifyApp> {
  return put<SpotifyApp>('/spotify/app', { client_id: clientId, client_secret: clientSecret })
}

export function deleteSpotifyApp(): Promise<SpotifyApp> {
  return del<SpotifyApp>('/spotify/app')
}
