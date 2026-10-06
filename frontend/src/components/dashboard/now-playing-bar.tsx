import type { ReactNode } from 'react'
import { Loader2, MonitorSpeaker, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Badge } from '@/components/shared/panel'
import { TrackArt } from '@/components/shared/track-row'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { authLinkProps } from '@/api/client'
import { Card } from '@/components/ui/card'
import { formatRequester } from '@/lib/app-constants'
import type { usePlayback } from '@/hooks/use-playback'
import type { SpotifyStatus } from '@/types/app'

type NowPlayingBarProps = {
  playback: ReturnType<typeof usePlayback>
  spotifyStatus: SpotifyStatus

  accessPending: boolean
}

function Bar({ children }: { children: ReactNode }) {
  return <Card className="min-h-16 flex-row items-center gap-3 px-5 py-3 text-sm">{children}</Card>
}

export function NowPlayingBar({ playback, spotifyStatus, accessPending }: NowPlayingBarProps) {
  const { activeTrack, activeDevice, playerChecked } = playback

  if (spotifyStatus === 'checking' || (spotifyStatus === 'connected' && !playerChecked)) {
    return (
      <Bar>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">
          {spotifyStatus === 'checking' ? 'Spotify 연결을 확인하는 중' : '재생 중인 기기를 확인하는 중'}
        </span>
      </Bar>
    )
  }

  if (spotifyStatus === 'disconnected') {
    return (
      <Bar>
        <img src="/spotify/full-logo.svg" alt="Spotify" className="h-5 w-auto shrink-0" />
        {accessPending ? (
          <>
            <Badge tone="primary">승인 대기 중</Badge>
            <span className="flex-1 text-muted-foreground">사용 신청을 검토하고 있습니다. 승인되면 연결해 주세요.</span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">연결되지 않아 신청곡을 대기열에 추가할 수 없습니다.</span>
        )}
        <a {...authLinkProps('/spotify/login')} className={buttonVariants({ variant: 'spotify', size: 'sm' })}>
          Spotify 연결
        </a>
      </Bar>
    )
  }

  if (!activeDevice) {
    return (
      <Bar>
        <MonitorSpeaker className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          재생 중인 Spotify 기기가 없습니다. 설정 탭에서 PC 앱이나 웹 플레이어를 선택해 주세요.
        </span>
      </Bar>
    )
  }

  const hasTrack = activeTrack.id !== 'empty'
  return (
    <Bar>
      <TrackArt src={activeTrack.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{hasTrack ? activeTrack.title : '재생 중인 곡 없음'}</p>
        {hasTrack && (
          <p className="truncate text-xs text-muted-foreground">
            {activeTrack.artist} · {formatRequester(activeTrack.requester)}
          </p>
        )}
      </div>
      <span className="hidden max-w-40 shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
        <MonitorSpeaker className="size-3.5 shrink-0" />
        <span className="truncate">{activeDevice.name}</span>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" onClick={playback.previousTrack} aria-label="이전 곡">
          <SkipBack />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          className="rounded-full"
          onClick={() => void playback.togglePlayback()}
          aria-label={playback.isPlaying ? '일시정지' : '재생'}
        >
          {playback.isPlaying ? <Pause /> : <Play className="ml-0.5" />}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={playback.nextTrack} aria-label="다음 곡">
          <SkipForward />
        </Button>
      </div>
    </Bar>
  )
}
