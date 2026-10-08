import axios from 'axios'
import { apiUrl, del, get, getAuthToken, patch, post } from './client'

export type DashboardState = {
  channel?: {
    channel_name?: string | null
    channel_image_url?: string | null
    is_verified?: boolean
  }

  error?: string
}

export type SongRequestStatus = 'pending' | 'played' | 'cancelled'

export type SongRequest = {
  id: number
  track_uri: string
  name: string
  artists: string[]
  image_url: string | null
  duration_ms: number | null
  requester_name: string | null
  added_at: string | null
  status: SongRequestStatus
}

export type PreferredDevice = {
  id: string
  name: string
  type: string
}

export type ChatbotSettings = {
  requests_enabled: boolean

  preferred_device: PreferredDevice | null
}

export type SpotifyAccount = {
  connected: boolean
  display_name?: string | null
  product?: string | null
  reauth_required?: boolean
}

export type DashboardPlayback = {
  playback_data?: Array<{
    track_uri?: string
    track_info?: {
      name?: string
      artists?: string[]
      album?: string
      image_url?: string | null
      duration_ms?: number
    } | null
    requester_name?: string | null
    addedAt?: string | null
  }>
  access_token?: string | null
}

type SpotifyQueueTrack = {
  uri?: unknown
  name?: unknown
  artists?: unknown
  album?: unknown
  duration_ms?: unknown
  requester_name?: unknown
}

export async function getDashboardState(): Promise<DashboardState> {
  try {
    return await get<DashboardState>('/dashboard/state')
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return { error: 'not_registered' }
    throw error
  }
}

export async function getSongRequests(view: 'pending' | 'history'): Promise<SongRequest[]> {
  return get<SongRequest[]>('/dashboard/requests', { view })
}

export async function cancelSongRequest(requestId: number): Promise<{ message: string }> {
  return del<{ message: string }>(`/dashboard/requests/${requestId}`)
}

export async function getChatbotSettings(): Promise<ChatbotSettings> {
  return get<ChatbotSettings>('/dashboard/settings')
}

export async function updateChatbotSettings(changes: Partial<ChatbotSettings>): Promise<ChatbotSettings> {
  return patch<ChatbotSettings>('/dashboard/settings', changes)
}

export async function getSpotifyAccount(): Promise<SpotifyAccount> {
  return get<SpotifyAccount>('/spotify/account')
}

export async function disconnectSpotifyAccount(): Promise<{ message: string }> {
  return del<{ message: string }>('/spotify/account')
}

export async function registerDashboard(): Promise<{ message: string }> {
  return post<{ message: string }>('/dashboard/register')
}

const spotifySocketRequestTimeoutMs = 10_000

const spotifySocketReconnectDelaysMs = [1_000, 2_000, 5_000, 10_000, 30_000]

const spotifySocketPolicyCloseCode = 1008

type PendingSpotifySocketRequest = {
  state: string
  resolve: (value: Record<string, unknown>) => void
  reject: (reason?: unknown) => void
  timer: number
}

let spotifySocket: WebSocket | null = null
let spotifySocketConnecting: Promise<WebSocket> | null = null
let spotifySocketReconnectTimer: number | undefined
let spotifySocketReconnectAttempt = 0
let lastSpotifyPlayerState: unknown = null
let spotifyTokenRefreshPromise: Promise<{ access_token: string }> | null = null

const spotifySocketRequests: PendingSpotifySocketRequest[] = []
const spotifySocketListeners = new Set<(payload: unknown) => void>()

function takeSpotifySocketRequest(
  predicate: (request: PendingSpotifySocketRequest) => boolean,
): PendingSpotifySocketRequest | undefined {
  const index = spotifySocketRequests.findIndex(predicate)
  if (index < 0) return undefined
  const [request] = spotifySocketRequests.splice(index, 1)
  window.clearTimeout(request.timer)
  return request
}

function handleSpotifySocketMessage(data: string) {
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch (error) {
    console.warn('[spotify] ignored a malformed WebSocket message', error)
    return
  }
  if (!payload || typeof payload !== 'object') return

  if ('track_window' in payload) lastSpotifyPlayerState = payload
  if (Array.isArray(payload) || 'track_window' in payload || 'queue' in payload || 'playback_data' in payload) {
    spotifySocketListeners.forEach((listener) => listener(payload))
  }

  const record = payload as Record<string, unknown>
  if (record.state === 'reauth_required') {
    takeSpotifySocketRequest((request) => request.state === 'refresh_token')?.reject(
      new Error('Spotify authorization expired. Please reconnect Spotify.'),
    )
  } else if ('playback_data' in record) {
    let request: PendingSpotifySocketRequest | undefined
    while ((request = takeSpotifySocketRequest((pending) => pending.state === 'request_playlist'))) {
      request.resolve(record)
    }
  } else if (typeof record.access_token === 'string') {
    takeSpotifySocketRequest((request) => request.state === 'initialize' || request.state === 'refresh_token')?.resolve(
      record,
    )
  }
}

function scheduleSpotifySocketReconnect() {
  if (spotifySocketReconnectTimer !== undefined || spotifySocketListeners.size === 0) return
  const delays = spotifySocketReconnectDelaysMs
  const delay = delays[Math.min(spotifySocketReconnectAttempt, delays.length - 1)]
  spotifySocketReconnectAttempt += 1
  spotifySocketReconnectTimer = window.setTimeout(() => {
    spotifySocketReconnectTimer = undefined
    if (spotifySocketListeners.size === 0) return
    void getSpotifyWebSocket()
      .then((socket) => socket.send(JSON.stringify({ state: 'request_playlist' })))
      .catch(() => undefined)
  }, delay)
}

function getSpotifyWebSocket(): Promise<WebSocket> {
  if (spotifySocket?.readyState === WebSocket.OPEN) return Promise.resolve(spotifySocket)
  if (spotifySocketConnecting) return spotifySocketConnecting

  spotifySocketConnecting = getAuthToken()
    .catch(() => null)
    .then(
      (token) =>
        new Promise<WebSocket>((resolve, reject) => {
          const url = new URL(apiUrl('/spotify/ws'), window.location.href)
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

          const socket = new WebSocket(url, token ? ['potibot', token] : undefined)
          spotifySocket = socket
          socket.onopen = () => {
            spotifySocketConnecting = null
            spotifySocketReconnectAttempt = 0
            resolve(socket)
          }
          socket.onmessage = (event) => handleSpotifySocketMessage(String(event.data))

          socket.onerror = () => console.warn('[spotify] WebSocket error')
          socket.onclose = (event) => {
            if (spotifySocket === socket) spotifySocket = null
            lastSpotifyPlayerState = null
            spotifySocketConnecting = null
            const error = new Error('Spotify WebSocket connection closed')
            reject(error)
            spotifySocketRequests.splice(0).forEach((request) => {
              window.clearTimeout(request.timer)
              request.reject(error)
            })
            if (event.code !== spotifySocketPolicyCloseCode) scheduleSpotifySocketReconnect()
          }
        }),
    )
  return spotifySocketConnecting
}

export function subscribeSpotifyWebSocket(listener: (payload: unknown) => void): () => void {
  spotifySocketListeners.add(listener)
  if (lastSpotifyPlayerState) listener(lastSpotifyPlayerState)
  return () => spotifySocketListeners.delete(listener)
}

async function sendSpotifyWebSocketMessage(
  message: Record<string, unknown>,
  expectResponse = true,
): Promise<Record<string, unknown>> {
  const socket = await getSpotifyWebSocket()
  if (!expectResponse) {
    socket.send(JSON.stringify(message))
    return {}
  }
  const state = String(message.state ?? '')
  return new Promise((resolve, reject) => {
    const request: PendingSpotifySocketRequest = {
      state,
      resolve,
      reject,
      timer: window.setTimeout(() => {
        if (takeSpotifySocketRequest((pending) => pending === request))
          reject(new Error(`Spotify WebSocket ${state} timed out`))
      }, spotifySocketRequestTimeoutMs),
    }
    spotifySocketRequests.push(request)
    socket.send(JSON.stringify(message))
  })
}

export async function initializeSpotifyPlayback(): Promise<DashboardPlayback> {
  return sendSpotifyWebSocketMessage({ state: 'initialize' }) as Promise<DashboardPlayback>
}

export function requestSpotifyPlayerRefresh(): void {
  void sendSpotifyWebSocketMessage({ state: 'refresh_player' }, false).catch((error) =>
    console.warn('[spotify] failed to request player refresh', error),
  )
}

export function requestSpotifyQueueSync(): void {
  void sendSpotifyWebSocketMessage({ state: 'sync_queue' }, false).catch((error) =>
    console.warn('[spotify] failed to request queue sync', error),
  )
}

export async function requestSpotifyPlaylist(): Promise<DashboardPlayback> {
  const data = await sendSpotifyWebSocketMessage({ state: 'request_playlist' })
  return normalizeSpotifyQueuePayload(data)
}

export function normalizeSpotifyQueuePayload(payload: unknown): DashboardPlayback {
  if (Array.isArray(payload)) return { playback_data: payload as DashboardPlayback['playback_data'] }

  if (!payload || typeof payload !== 'object') return { playback_data: [] }
  const data = payload as Record<string, unknown>
  const rawPlayback = data.playback_data
  const queuePayload =
    rawPlayback && typeof rawPlayback === 'object' && !Array.isArray(rawPlayback)
      ? (rawPlayback as Record<string, unknown>)
      : data

  if (Array.isArray(queuePayload.queue)) {
    return {
      playback_data: queuePayload.queue.flatMap((rawTrack) => {
        const track = rawTrack as SpotifyQueueTrack
        const uri = typeof track.uri === 'string' ? track.uri : ''
        if (!uri) return []
        const artists = Array.isArray(track.artists)
          ? track.artists.flatMap((artist) =>
              typeof artist === 'object' && artist && 'name' in artist
                ? [String((artist as { name?: unknown }).name)]
                : [],
            )
          : []
        const albumRecord =
          typeof track.album === 'object' && track.album
            ? (track.album as { name?: unknown; images?: unknown[] })
            : null
        const album = String(albumRecord?.name ?? '')
        const images = Array.isArray(albumRecord?.images) ? albumRecord.images : []
        const imageUrl =
          images.length > 0 && typeof images[0] === 'object' && images[0] && 'url' in images[0]
            ? String((images[0] as { url?: unknown }).url)
            : null
        return [
          {
            track_uri: uri,
            track_info: {
              name: typeof track.name === 'string' ? track.name : undefined,
              artists,
              album,
              image_url: imageUrl,
              duration_ms: typeof track.duration_ms === 'number' ? track.duration_ms : undefined,
            },
            requester_name: typeof track.requester_name === 'string' ? track.requester_name : null,
          },
        ]
      }),
    }
  }

  if (Array.isArray(data.playback_data)) {
    return {
      playback_data: data.playback_data as DashboardPlayback['playback_data'],
      ...(typeof data.access_token === 'string' ? { access_token: data.access_token } : {}),
    }
  }

  return { playback_data: [] }
}

export async function refreshSpotifyToken(): Promise<{ access_token: string }> {
  if (spotifyTokenRefreshPromise) return spotifyTokenRefreshPromise
  spotifyTokenRefreshPromise = sendSpotifyWebSocketMessage({ state: 'refresh_token' })
    .then((data) => ({ access_token: String(data.access_token ?? '') }))
    .finally(() => {
      spotifyTokenRefreshPromise = null
    })
  return spotifyTokenRefreshPromise
}
