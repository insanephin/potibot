import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getChatbotSettings,
  refreshSpotifyToken,
  requestSpotifyPlayerRefresh,
  requestSpotifyQueueSync,
  subscribeSpotifyWebSocket,
  updateChatbotSettings,
  type PreferredDevice,
} from '@/api/dashboard'
import {
  addSpotifyTrackToQueue,
  getSpotifyDevices,
  getSpotifyPlayerState,
  getSpotifyQueue,
  isSelectableDevice,
  pauseSpotifyPlayback,
  resumeSpotifyPlayback,
  skipSpotifyTrack,
  transferSpotifyPlayback,
  type SpotifyDevice,
} from '@/api/spotify'
import type { QueueTrack, Route } from '@/types/app'
import { localPlaybackRequester } from '@/lib/app-constants'
import { formatDuration } from '@/lib/normalizers'
import { usePopup } from '@/hooks/use-popup'

const postCommandRefreshMs = [400, 1500]

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const emptyTrack: QueueTrack = {
  id: 'empty',
  title: '재생 중인 곡 없음',
  artist: '',
  album: '',
  duration: '0:00',
  requester: '',
  progressPercent: 0,
  elapsed: '0:00',
}

type SpotifyPlaybackState = {
  event?: string
  device?: { id: string; name: string; type: string } | null
  paused: boolean
  position: number
  duration: number

  fetched_at?: number
  server_time?: number
  track_window?: {
    current_track?: {
      id: string
      name: string
      uri: string
      duration_ms: number
      artists: Array<{ name: string }>
      album?: { name?: string; images?: Array<{ url: string }> }
    }
  }
}

const isQueuePayload = (payload: unknown): boolean =>
  Array.isArray(payload) ||
  (Boolean(payload) &&
    typeof payload === 'object' &&
    ('queue' in (payload as object) || 'playback_data' in (payload as object)))

const isLiveStatusPayload = (payload: unknown): payload is { event: 'live_status'; live: boolean } =>
  Boolean(payload) && typeof payload === 'object' && (payload as { event?: unknown }).event === 'live_status'

const isPlaybackStatePayload = (payload: unknown): payload is SpotifyPlaybackState =>
  Boolean(payload) && typeof payload === 'object' && (payload as { event?: unknown }).event === 'playback_update'

const currentPosition = (state: SpotifyPlaybackState, durationMs: number) => {
  const sinceRead = state.server_time && state.fetched_at ? (state.server_time - state.fetched_at) * 1000 : 0
  const position = state.paused ? state.position : state.position + Math.max(0, sinceRead)
  return Math.min(Math.max(0, position), durationMs || position)
}

const findPreferredDevice = (devices: SpotifyDevice[], preferred: PreferredDevice) =>
  devices.find((device) => device.id === preferred.id) ??
  devices.find((device) => device.name === preferred.name && device.type === preferred.type)

const describeControlError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('404')) return '재생 중인 Spotify 기기를 찾을 수 없습니다. 기기를 다시 선택해 주세요.'
  if (message.includes('403')) return '이 기기에서는 지원하지 않는 조작입니다.'
  if (message && !message.startsWith('Spotify API')) return message
  return 'Spotify 제어에 실패했습니다.'
}

export function usePlayback(
  route: Route,
  spotifyAccessToken: string | null = null,
  queueTracks: QueueTrack[] = [],
  playbackStreamUrl: string | null = null,
  onPlaylistRefresh?: (data?: unknown) => void,
) {
  const [playlist, setPlaylist] = useState<QueueTrack[]>(queueTracks)
  const [isPlaying, setIsPlaying] = useState(false)
  const [spotifyTrack, setSpotifyTrack] = useState<QueueTrack | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [activeDevice, setActiveDevice] = useState<SpotifyDevice | null>(null)
  const [playerChecked, setPlayerChecked] = useState(false)

  const [isLive, setIsLive] = useState<boolean | null>(null)

  const [jumpingUri, setJumpingUri] = useState<string | null>(null)
  const jumpingRef = useRef(false)
  const playlistRef = useRef(queueTracks)
  const playlistRefreshRef = useRef(onPlaylistRefresh)
  const tokenRef = useRef(spotifyAccessToken)
  const positionRef = useRef(0)
  const durationRef = useRef(0)
  const popup = usePopup()

  useEffect(() => {
    playlistRef.current = playlist
    playlistRefreshRef.current = onPlaylistRefresh
  }, [onPlaylistRefresh, playlist])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaylist(queueTracks)
  }, [queueTracks])
  useEffect(() => {
    tokenRef.current = spotifyAccessToken
  }, [spotifyAccessToken])

  const withSpotifyToken = useCallback(
    async <T>(action: (accessToken: string) => Promise<T>): Promise<T | undefined> => {
      const accessToken = tokenRef.current
      if (!accessToken) return undefined
      try {
        return await action(accessToken)
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('401')) throw error
        const refreshed = await refreshSpotifyToken()
        tokenRef.current = refreshed.access_token
        return await action(refreshed.access_token)
      }
    },
    [],
  )

  const updatePlaybackState = useCallback((state: SpotifyPlaybackState) => {
    setPlayerChecked(true)
    const device = state.device
    setActiveDevice(device ? { ...device, is_active: true, volume_percent: null, supports_volume: false } : null)
    const item = state.track_window?.current_track
    if (!item) {
      setSpotifyTrack(null)
      setIsPlaying(false)
      return
    }

    const durationMs = item.duration_ms || state.duration || 0
    const position = currentPosition(state, durationMs)
    const requester = playlistRef.current.find((track) => track.uri === item.uri)?.requester ?? localPlaybackRequester
    positionRef.current = position
    durationRef.current = Math.max(0, durationMs)
    const nextProgress = durationMs > 0 ? Math.min(100, (position / durationMs) * 100) : 0

    setSpotifyTrack({
      id: item.id,
      title: item.name,
      artist: item.artists.map((artist) => artist.name).join(', '),
      album: item.album?.name ?? 'Spotify',
      duration: formatDuration(durationMs),
      requester,
      imageUrl: item.album?.images?.[0]?.url,
      uri: item.uri,
      progressPercent: nextProgress,
      elapsed: formatDuration(position),
    })
    setIsPlaying(!state.paused)
  }, [])

  const refreshPlayerState = useCallback(() => requestSpotifyPlayerRefresh(), [])

  const refreshDevices = useCallback(async () => {
    try {
      const nextDevices = await withSpotifyToken((currentToken) => getSpotifyDevices(currentToken))
      if (nextDevices) setDevices(nextDevices.filter(isSelectableDevice))
    } catch (error) {
      console.warn('[spotify] failed to list devices', error)
    }
  }, [withSpotifyToken])

  useEffect(() => {
    if (route !== 'dashboard' || !spotifyAccessToken) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshDevices()
  }, [route, spotifyAccessToken, refreshDevices])

  useEffect(() => {
    if (!isPlaying || durationRef.current <= 0) return
    const interval = window.setInterval(() => {
      const nextPosition = Math.min(durationRef.current, positionRef.current + 1000)
      positionRef.current = nextPosition
      const nextProgress = durationRef.current > 0 ? (nextPosition / durationRef.current) * 100 : 0
      setSpotifyTrack((current) =>
        current
          ? {
              ...current,
              elapsed: formatDuration(nextPosition),
              progressPercent: nextProgress,
            }
          : current,
      )
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isPlaying, spotifyTrack?.uri])

  const applyQueuePayload = useCallback((payload: unknown) => {
    playlistRefreshRef.current?.(payload)
  }, [])

  useEffect(() => {
    if (!playbackStreamUrl) return
    const streamUrl = playbackStreamUrl.startsWith('http')
      ? playbackStreamUrl
      : `${window.location.origin}${playbackStreamUrl}`
    const source = new EventSource(streamUrl)
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as unknown
        if (isLiveStatusPayload(payload)) {
          setIsLive(payload.live)

          if (!payload.live) {
            setSpotifyTrack(null)
            setIsPlaying(false)
            applyQueuePayload({ playback_data: [] })
          }
        } else if (isQueuePayload(payload)) applyQueuePayload(payload)
        else if (isPlaybackStatePayload(payload)) updatePlaybackState(payload)
      } catch (error) {
        console.error('[playback] failed to parse SSE state', error)
      }
    }
    source.onerror = () => console.warn('[playback] SSE connection lost; browser will reconnect automatically')
    return () => {
      source.close()

      setIsLive(null)
      setSpotifyTrack(null)
      setIsPlaying(false)
      applyQueuePayload({ playback_data: [] })
    }
  }, [applyQueuePayload, playbackStreamUrl, updatePlaybackState])

  useEffect(() => {
    if (route !== 'dashboard') return
    const unsubscribe = subscribeSpotifyWebSocket((payload) => {
      if (isQueuePayload(payload)) applyQueuePayload(payload)
      else if (isPlaybackStatePayload(payload)) updatePlaybackState(payload)
    })
    return () => {
      unsubscribe()

      setSpotifyTrack(null)
      setIsPlaying(false)
      setActiveDevice(null)
      setPlayerChecked(false)
    }
  }, [applyQueuePayload, route, updatePlaybackState])

  const runTransport = useCallback(
    async (failureTitle: string, action: (accessToken: string) => Promise<void>) => {
      if (!activeDevice || !tokenRef.current) {
        void popup.alert('재생 중인 Spotify 기기가 없습니다', '기기를 선택한 뒤 다시 시도해 주세요.')
        return false
      }
      try {
        await withSpotifyToken(action)
        return true
      } catch (error) {
        void popup.alert(failureTitle, describeControlError(error))
        return false
      } finally {
        for (const delay of postCommandRefreshMs) window.setTimeout(refreshPlayerState, delay)
      }
    },
    [activeDevice, popup, refreshPlayerState, withSpotifyToken],
  )

  const togglePlayback = useCallback(async () => {
    const nextPlaying = !isPlaying
    const done = await runTransport(nextPlaying ? '재생하지 못했습니다' : '일시정지하지 못했습니다', (currentToken) =>
      nextPlaying ? resumeSpotifyPlayback(currentToken) : pauseSpotifyPlayback(currentToken),
    )
    if (done) setIsPlaying(nextPlaying)
  }, [isPlaying, runTransport])

  const skipTrack = useCallback(
    (direction: 'next' | 'previous') => {
      void runTransport(
        direction === 'next' ? '다음 곡으로 넘기지 못했습니다' : '이전 곡으로 넘기지 못했습니다',
        (currentToken) => skipSpotifyTrack(currentToken, direction),
      )
    },
    [runTransport],
  )

  const selectDevice = useCallback(
    async (device: SpotifyDevice, { auto = false } = {}) => {
      if (!tokenRef.current) {
        void popup.alert('Spotify 연결이 필요합니다', '설정 탭에서 Spotify를 연결해 주세요.')
        return false
      }
      try {
        if (isPlaying && activeDevice && activeDevice.id !== device.id) {
          await withSpotifyToken((currentToken) => pauseSpotifyPlayback(currentToken)).catch((error) =>
            console.warn('[spotify] failed to pause before device switch', error),
          )
          setIsPlaying(false)
        }
        await withSpotifyToken((currentToken) => transferSpotifyPlayback(currentToken, device.id))

        requestSpotifyQueueSync()
        if (!auto) {
          try {
            await updateChatbotSettings({
              preferred_device: { id: device.id, name: device.name, type: device.type },
            })
          } catch (error) {
            console.warn('[spotify] failed to save preferred device', error)
            void popup.alert(
              '기기를 저장하지 못했습니다',
              '기기는 연결했지만 자동 연결할 기기로 저장하지 못했습니다. 잠시 후 다시 선택해 주세요.',
            )
            return false
          }
        }
        return true
      } catch (error) {
        if (auto) console.warn('[spotify] failed to reconnect preferred device', error)
        else void popup.alert('기기를 바꾸지 못했습니다', describeControlError(error))
        return false
      } finally {
        for (const delay of postCommandRefreshMs) {
          window.setTimeout(() => {
            refreshPlayerState()
            void refreshDevices()
          }, delay)
        }
      }
    },
    [activeDevice, isPlaying, popup, refreshDevices, refreshPlayerState, withSpotifyToken],
  )

  const reconnectTriedRef = useRef(false)
  useEffect(() => {
    if (route !== 'dashboard' || !spotifyAccessToken || !playerChecked || activeDevice || reconnectTriedRef.current)
      return
    reconnectTriedRef.current = true
    void (async () => {
      const { preferred_device: preferred } = await getChatbotSettings()
      if (!preferred) return
      const available = await withSpotifyToken((currentToken) => getSpotifyDevices(currentToken))
      const device = available && findPreferredDevice(available.filter(isSelectableDevice), preferred)
      if (device) await selectDevice(device, { auto: true })
    })().catch((error) => console.warn('[spotify] failed to reconnect preferred device', error))
  }, [activeDevice, playerChecked, route, selectDevice, spotifyAccessToken, withSpotifyToken])

  const waitForTrackChange = useCallback(
    async (fromUri: string | null): Promise<string | null> => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(300)
        const state = await withSpotifyToken((currentToken) => getSpotifyPlayerState(currentToken))
        const uri = state?.item?.uri ?? null
        if (uri && uri !== fromUri) return uri
      }
      return null
    },
    [withSpotifyToken],
  )

  const jumpToQueueTrack = useCallback(
    async (uri: string) => {
      if (jumpingRef.current) return
      if (!activeDevice || !tokenRef.current) {
        void popup.alert('재생 중인 Spotify 기기가 없습니다', '기기를 선택한 뒤 다시 시도해 주세요.')
        return
      }
      jumpingRef.current = true
      setJumpingUri(uri)
      try {
        let addedToQueue = false
        for (let round = 0; round < 3; round += 1) {
          const queue = await withSpotifyToken((currentToken) => getSpotifyQueue(currentToken))
          if (!queue || queue.currentUri === uri) return
          const position = queue.queueUris.indexOf(uri)
          if (position < 0) {
            if (addedToQueue) break

            await withSpotifyToken((currentToken) => addSpotifyTrackToQueue(currentToken, uri, activeDevice.id))
            addedToQueue = true
            continue
          }
          let currentUri = queue.currentUri
          for (let skip = 0; skip <= position; skip += 1) {
            await withSpotifyToken((currentToken) => skipSpotifyTrack(currentToken, 'next'))
            const nextUri = await waitForTrackChange(currentUri)
            if (!nextUri) break
            currentUri = nextUri
            if (currentUri === uri) return
          }
        }
        void popup.alert('지금 재생하지 못했습니다', '선택한 신청곡을 Spotify 대기열에서 찾지 못했습니다.')
      } catch (error) {
        void popup.alert('지금 재생하지 못했습니다', describeControlError(error))
      } finally {
        jumpingRef.current = false
        setJumpingUri(null)
        for (const delay of postCommandRefreshMs) window.setTimeout(refreshPlayerState, delay)
      }
    },
    [activeDevice, popup, refreshPlayerState, waitForTrackChange, withSpotifyToken],
  )

  return {
    playlist,
    isPlaying,
    activeTrack: spotifyTrack ?? emptyTrack,
    devices,
    activeDevice,
    playerChecked,
    isLive,
    jumpingUri,
    refreshDevices,
    selectDevice,
    togglePlayback,
    previousTrack: () => skipTrack('previous'),
    nextTrack: () => skipTrack('next'),
    jumpToQueueTrack,
  }
}
