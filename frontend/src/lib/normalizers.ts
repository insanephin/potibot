import type { DashboardPlayback } from '@/api/dashboard'
import type { QueueTrack } from '@/types/app'
import { localPlaybackRequester } from '@/lib/app-constants'

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export function normalizePlaybackTracks(items: DashboardPlayback['playback_data']): QueueTrack[] {
  return (items ?? []).flatMap((item, index) => {
    if (!item.track_uri) return []
    return [
      {
        id: `${item.track_uri}-${index}`,
        title: item.track_info?.name ?? '알 수 없는 곡',
        artist: item.track_info?.artists?.join(', ') ?? '',
        album: item.track_info?.album ?? '',
        duration: item.track_info?.duration_ms ? formatDuration(item.track_info.duration_ms) : '',
        requester: item.requester_name ?? localPlaybackRequester,
        imageUrl: item.track_info?.image_url ?? undefined,
        uri: item.track_uri,
      },
    ]
  })
}
