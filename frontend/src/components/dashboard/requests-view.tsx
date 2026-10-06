import { History, ListMusic, LoaderCircle, Play, Trash2 } from 'lucide-react'
import { Badge, EmptyState } from '@/components/shared/panel'
import { TrackList, TrackRow } from '@/components/shared/track-row'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { SongRequest, SongRequestStatus } from '@/api/dashboard'
import type { useSongRequests } from '@/hooks/use-song-requests'

const statusBadges: Record<Exclude<SongRequestStatus, 'pending'>, { label: string; tone: 'primary' | 'muted' }> = {
  played: { label: '재생됨', tone: 'primary' },
  cancelled: { label: '취소됨', tone: 'muted' },
}

const formatAddedAt = (addedAt: string | null) => {
  if (!addedAt) return ''
  const date = new Date(addedAt)
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

type RequestsViewProps = {
  view: 'pending' | 'history'
  requests: ReturnType<typeof useSongRequests>
  currentTrackUri?: string
  canControlPlayback: boolean

  jumpingUri: string | null
  onPlayNow: (trackUri: string) => void
}

type RequestActionsProps = {
  request: SongRequest
  isCurrent: boolean
  canControlPlayback: boolean
  jumpingUri: string | null
  isCancelling: boolean
  onPlayNow: () => void
  onCancel: () => void
}

function RequestActions({
  request,
  isCurrent,
  canControlPlayback,
  jumpingUri,
  isCancelling,
  onPlayNow,
  onCancel,
}: RequestActionsProps) {
  if (request.status !== 'pending') {
    const badge = statusBadges[request.status]
    return <Badge tone={badge.tone}>{badge.label}</Badge>
  }
  return (
    <>
      {isCurrent ? (
        <Badge tone="primary">재생 중</Badge>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPlayNow}
          disabled={!canControlPlayback || jumpingUri !== null}
          aria-label={`${request.name} 지금 재생`}
          title={canControlPlayback ? '지금 재생 (앞의 곡은 건너뜀)' : '재생 중인 Spotify 기기가 필요합니다'}
        >
          {jumpingUri === request.track_uri ? <LoaderCircle className="animate-spin" /> : <Play />}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost-destructive"
        size="icon-sm"
        onClick={onCancel}
        disabled={isCancelling}
        aria-label={`${request.name} 신청 삭제`}
        title="신청 삭제"
      >
        {isCancelling ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
      </Button>
    </>
  )
}

export function RequestsView({
  view,
  requests,
  currentTrackUri,
  canControlPlayback,
  jumpingUri,
  onPlayNow,
}: RequestsViewProps) {
  const list = view === 'pending' ? requests.pending : requests.history

  return (
    <Card className="min-h-40 w-full min-w-0">
      {list.length === 0 ? (
        view === 'pending' ? (
          <EmptyState icon={ListMusic} title="대기 중인 신청곡이 없습니다" />
        ) : (
          <EmptyState icon={History} title="신청 기록이 없습니다" />
        )
      ) : (
        <TrackList>
          {list.map((request, index) => {
            const isCurrent = request.status === 'pending' && request.track_uri === currentTrackUri
            return (
              <TrackRow
                key={request.id}
                index={request.status === 'pending' ? index + 1 : undefined}
                imageUrl={request.image_url}
                title={request.name}
                subtitle={[request.artists.join(', '), request.requester_name ?? '알 수 없음']
                  .filter(Boolean)
                  .join(' · ')}
                highlighted={isCurrent}
                trailing={
                  <>
                    <span className="mr-1 hidden tabular-nums sm:inline">{formatAddedAt(request.added_at)}</span>
                    <RequestActions
                      request={request}
                      isCurrent={isCurrent}
                      canControlPlayback={canControlPlayback}
                      jumpingUri={jumpingUri}
                      isCancelling={requests.cancellingIds.has(request.id)}
                      onPlayNow={() => onPlayNow(request.track_uri)}
                      onCancel={() => void requests.cancel(request.id)}
                    />
                  </>
                }
              />
            )
          })}
        </TrackList>
      )}
    </Card>
  )
}
