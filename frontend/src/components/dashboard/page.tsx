import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { AppFooter } from '@/components/app/app-footer'
import { ExtensionTip } from '@/components/dashboard/extension-tip'
import { NowPlayingBar } from '@/components/dashboard/now-playing-bar'
import { RequestsView } from '@/components/dashboard/requests-view'
import { SettingsView } from '@/components/dashboard/settings-view'
import { LoadingOverlay, Segmented } from '@/components/shared/panel'
import { Button } from '@/components/ui/button'
import { pageShellClassName } from '@/lib/app-constants'
import { cn } from '@/lib/utils'
import { useSongRequests } from '@/hooks/use-song-requests'
import { useSpotifyAccess } from '@/hooks/use-spotify-access'
import { usePopup } from '@/hooks/use-popup'
import type { usePlayback } from '@/hooks/use-playback'
import type { SpotifyStatus } from '@/types/app'

type DashboardTab = 'pending' | 'history' | 'settings'

type DashboardPanelProps = {
  spotifyStatus: SpotifyStatus
  playback: ReturnType<typeof usePlayback>

  loading: boolean
}

type DashboardPageProps = DashboardPanelProps & { header: ReactNode }

const readSpotifyCallbackReason = () => new URLSearchParams(window.location.search).get('spotify')

function DashboardPanel({ spotifyStatus, playback, loading }: DashboardPanelProps) {
  const [callbackReason] = useState(readSpotifyCallbackReason)
  const callbackHandledRef = useRef(false)
  const promptAccessRequest = callbackReason === 'access_required'
  const [tab, setTab] = useState<DashboardTab>(callbackReason ? 'settings' : 'pending')
  const requests = useSongRequests(true)
  const { access, setAccess } = useSpotifyAccess()
  const popup = usePopup()

  useEffect(() => {
    if (!callbackReason || callbackHandledRef.current) return
    callbackHandledRef.current = true
    window.history.replaceState(null, '', window.location.pathname)
    if (callbackReason === 'app_forbidden')
      void popup.alert(
        'Spotify 앱에 계정을 추가해 주세요',
        '등록한 앱의 User Management에 연결하려는 Spotify 계정의 이메일을 추가한 뒤 다시 연결해 주세요.',
      )
  }, [callbackReason, popup])

  const tabs: { key: DashboardTab; label: string; badge?: number }[] = [
    { key: 'pending', label: '대기열', badge: requests.pending.length },
    { key: 'history', label: '기록' },
    { key: 'settings', label: '설정' },
  ]
  const playerPending = spotifyStatus === 'checking' || (spotifyStatus === 'connected' && !playback.playerChecked)

  return (
    <>
      <NowPlayingBar playback={playback} spotifyStatus={spotifyStatus} accessPending={access?.status === 'pending'} />
      <div className="flex items-center gap-2">
        <Segmented items={tabs} value={tab} onChange={setTab} stretch />
        {tab !== 'settings' && (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => void requests.refresh()}
            aria-label="신청곡 새로고침"
          >
            <RefreshCw className={cn(requests.loading && 'animate-spin')} />
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        {tab === 'settings' ? (
          <SettingsView
            playback={playback}
            promptAccessRequest={promptAccessRequest}
            access={access}
            onAccessChange={setAccess}
          />
        ) : (
          <RequestsView
            view={tab}
            requests={requests}
            currentTrackUri={playback.activeTrack.uri}
            canControlPlayback={Boolean(playback.activeDevice)}
            jumpingUri={playback.jumpingUri}
            onPlayNow={(trackUri) => void playback.jumpToQueueTrack(trackUri)}
          />
        )}
      </div>
      <LoadingOverlay show={loading || !requests.loaded || playerPending} />
      <ExtensionTip />
    </>
  )
}

export function DashboardPage({ header, ...panelProps }: DashboardPageProps) {
  return (
    <div className={pageShellClassName}>
      {header}
      <DashboardPanel {...panelProps} />
      <AppFooter />
    </div>
  )
}
