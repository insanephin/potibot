import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelSongRequest, getSongRequests, subscribeSpotifyWebSocket, type SongRequest } from '@/api/dashboard'
import { usePopup } from '@/hooks/use-popup'

const refreshDebounceMs = 300

export function useSongRequests(enabled: boolean) {
  const [pending, setPending] = useState<SongRequest[]>([])
  const [history, setHistory] = useState<SongRequest[]>([])
  const [loading, setLoading] = useState(false)

  const [loaded, setLoaded] = useState(false)
  const [cancellingIds, setCancellingIds] = useState<Set<number>>(new Set())
  const refreshTimerRef = useRef<number | null>(null)

  const refreshSequenceRef = useRef(0)
  const popup = usePopup()

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const sequence = ++refreshSequenceRef.current
      const isLatest = () => sequence === refreshSequenceRef.current
      setLoading(true)
      try {
        const [nextPending, nextHistory] = await Promise.all([getSongRequests('pending'), getSongRequests('history')])
        if (!isLatest()) return
        setPending(nextPending)
        setHistory(nextHistory)
      } catch (fetchError) {
        console.error('[requests] failed to fetch song requests', fetchError)
        if (!silent && isLatest()) void popup.alert('신청곡을 불러오지 못했습니다', '잠시 후 다시 시도해 주세요.')
      } finally {
        if (isLatest()) {
          setLoading(false)
          setLoaded(true)
        }
      }
    },
    [popup],
  )

  useEffect(() => {
    if (!enabled) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()

    const unsubscribe = subscribeSpotifyWebSocket((payload) => {
      if (!payload || typeof payload !== 'object' || !('playback_data' in payload)) return
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        void refresh({ silent: true })
      }, refreshDebounceMs)
    })
    return () => {
      unsubscribe()
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    }
  }, [enabled, refresh])

  const cancel = useCallback(
    async (requestId: number) => {
      setCancellingIds((current) => new Set(current).add(requestId))
      try {
        await cancelSongRequest(requestId)
        setPending((current) => current.filter((request) => request.id !== requestId))
        void refresh({ silent: true })
      } catch (cancelError) {
        console.error('[requests] failed to cancel request', cancelError)
        void popup.alert(
          '신청곡을 삭제하지 못했습니다',
          '이미 재생됐거나 취소된 신청곡일 수 있습니다. 목록을 새로고침해 주세요.',
        )
      } finally {
        setCancellingIds((current) => {
          const next = new Set(current)
          next.delete(requestId)
          return next
        })
      }
    },
    [popup, refresh],
  )

  return { pending, history, loading, loaded, cancellingIds, refresh, cancel }
}
