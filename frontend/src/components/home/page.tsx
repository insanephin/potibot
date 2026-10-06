import type { ReactNode } from 'react'
import { ListMusic, Music2, RadioTower } from 'lucide-react'
import { AppFooter } from '@/components/app/app-footer'
import { EmptyState, LoadingOverlay, PanelHeader } from '@/components/shared/panel'
import { TrackArt, TrackList, TrackRow } from '@/components/shared/track-row'
import { Card } from '@/components/ui/card'
import type { usePlayback } from '@/hooks/use-playback'
import { formatRequester, pageShellClassName } from '@/lib/app-constants'

type HomePageProps = {
  header: ReactNode
  playback: ReturnType<typeof usePlayback>

  loading: boolean
}

export function HomePage({ header, playback, loading }: HomePageProps) {
  const { activeTrack, playlist, isLive } = playback
  const hasActiveTrack = activeTrack.id !== 'empty'

  return (
    <div className={pageShellClassName}>
      {header}
      {isLive ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <Card className="min-h-96 w-full min-w-0 md:min-h-0 md:flex-[1.35]">
            {hasActiveTrack ? (
              <div className="flex flex-1 flex-col justify-center gap-8 p-6 md:p-8">
                <div className="flex flex-col items-center text-center">
                  <TrackArt src={activeTrack.imageUrl} className="size-44 rounded-lg md:size-56 [&_svg]:size-12" />
                  <p className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">{activeTrack.title}</p>
                  <p className="mt-2 text-base text-muted-foreground">{activeTrack.artist || '아티스트 알 수 없음'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[activeTrack.album, formatRequester(activeTrack.requester)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-label="재생 진행률">
                    <div
                      className="h-full rounded-full bg-brand-gradient transition-[width] duration-300"
                      style={{ width: `${activeTrack.progressPercent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
                    <span>{activeTrack.elapsed || '0:00'}</span>
                    <span>{activeTrack.duration}</span>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon={Music2} title="재생 중인 곡이 없습니다" />
            )}
          </Card>

          <Card className="min-h-96 w-full min-w-0 md:min-h-0 md:flex-[0.95]">
            <PanelHeader title="재생목록" />
            {playlist.length === 0 ? (
              <EmptyState icon={ListMusic} title="대기 중인 신청곡이 없습니다" />
            ) : (
              <TrackList>
                {playlist.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    index={index + 1}
                    imageUrl={track.imageUrl}
                    title={track.title}
                    subtitle={[track.artist, formatRequester(track.requester)].filter(Boolean).join(' · ')}
                    trailing={<span className="tabular-nums">{track.duration}</span>}
                  />
                ))}
              </TrackList>
            )}
          </Card>
        </div>
      ) : (
        <Card className="min-h-96 flex-1">
          {isLive === false && (
            <EmptyState
              icon={RadioTower}
              title="지금은 방송 중이 아닙니다"
              description="방송이 시작되면 재생 중인 곡과 신청곡이 여기에 표시됩니다."
            />
          )}
        </Card>
      )}
      <AppFooter />
      <LoadingOverlay show={loading || isLive === null} />
    </div>
  )
}
