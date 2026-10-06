import { useCallback, useEffect, useState } from 'react'
import type { DashboardPlayback, DashboardState } from '@/api/dashboard'
import {
  getDashboardState,
  initializeSpotifyPlayback,
  normalizeSpotifyQueuePayload,
  requestSpotifyPlaylist,
} from '@/api/dashboard'

export function useDashboardData(enabled = true) {
  const [stateData, setStateData] = useState<DashboardState | null>(null)
  const [playbackData, setPlaybackData] = useState<DashboardPlayback | null>(null)

  const [stateLoading, setStateLoading] = useState(false)

  const [stateChecked, setStateChecked] = useState(false)

  const [stateFailed, setStateFailed] = useState(false)
  const [playbackError, setPlaybackError] = useState<Error | null>(null)

  const fetchState = useCallback(async () => {
    setStateLoading(true)
    try {
      setStateData(await getDashboardState())
      setStateFailed(false)
    } catch {
      setStateData(null)
      setStateFailed(true)
    } finally {
      setStateLoading(false)
      setStateChecked(true)
    }
  }, [])

  const fetchPlayback = useCallback(async () => {
    setPlaybackError(null)
    try {
      const initialized = await initializeSpotifyPlayback()
      const playlist = await requestSpotifyPlaylist()
      setPlaybackData({
        ...initialized,
        ...playlist,
        access_token: playlist.access_token ?? initialized.access_token,
      })
    } catch (error) {
      setPlaybackError(error instanceof Error ? error : new Error('Failed to fetch playback'))
      setPlaybackData(null)
    }
  }, [])

  const refreshPlaybackPlaylist = useCallback(async (eventData?: unknown) => {
    try {
      const nextPlayback =
        eventData === undefined ? await requestSpotifyPlaylist() : normalizeSpotifyQueuePayload(eventData)

      const nextData = nextPlayback.playback_data ?? []
      setPlaybackData((current) => {
        if (JSON.stringify(current?.playback_data ?? []) === JSON.stringify(nextData)) return current

        return { ...(current ?? {}), playback_data: nextData }
      })
    } catch (error) {
      console.error('[spotify] failed to refresh requester data', error)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchState()
    void fetchPlayback()
  }, [enabled, fetchState, fetchPlayback])

  return {
    state: { data: stateData, loading: stateLoading, checked: stateChecked, failed: stateFailed },
    playback: { data: playbackData, error: playbackError },
    refetch: {
      state: fetchState,
      playbackPlaylist: refreshPlaybackPlaylist,
    },
  }
}
