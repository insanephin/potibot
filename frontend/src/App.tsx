import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppFooter } from '@/components/app/app-footer'
import { ErrorPage } from '@/components/app/error-page'
import { Navigate, Route as RouterRoute, Routes, useLocation } from 'react-router-dom'
import axios from 'axios'
import { SearchX } from 'lucide-react'
import { AppHeader } from '@/components/app/app-header'
import { StreamerSelector } from '@/components/app/streamer-selector'
import { HomePage } from '@/components/home/page'
import { LandingPage } from '@/components/home/landing-page'
import { DashboardPage } from '@/components/dashboard/page'
import { DashboardRegisterDialog } from '@/components/dashboard/register-dialog'
import { LegalPage, type LegalDocument } from '@/components/legal/page'
import { EmptyState, LoadingOverlay } from '@/components/shared/panel'
import { Card } from '@/components/ui/card'
import type { Route, SearchableStreamer, SpotifyStatus } from '@/types/app'
import type { ChannelInfo } from '@/types/chzzk'
import { getCurrentUser, getUserInfo, searchChannels, type CurrentUser } from '@/api/user'
import { loginUrl } from '@/api/client'
import { useDashboardData } from '@/hooks/use-dashboard-data'
import { usePlayback } from '@/hooks/use-playback'
import { appName, defaultProfileImageUrl, officialMarkUrl, pageShellClassName } from '@/lib/app-constants'
import { normalizePlaybackTracks } from '@/lib/normalizers'

const minimumSearchLength = 2

const searchDebounceMs = 250

const legalDocuments: Record<string, LegalDocument> = { '/terms': 'terms', '/privacy': 'privacy' }

function PageLoading({ header }: { header: ReactNode }) {
  return (
    <div className={pageShellClassName}>
      {header}
      <Card className="min-h-96 flex-1" />
      <AppFooter />
      <LoadingOverlay show />
    </div>
  )
}

function ChannelNotFound({ header, loading }: { header: ReactNode; loading: boolean }) {
  return (
    <div className={pageShellClassName}>
      {header}
      <Card className="min-h-96 flex-1">
        <EmptyState
          icon={SearchX}
          title="스트리머를 찾을 수 없습니다"
          description="입력한 채널 ID에 해당하는 스트리머가 존재하지 않습니다."
        />
      </Card>
      <AppFooter />
      <LoadingOverlay show={loading} />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const route: Route = location.pathname.startsWith('/dashboard') ? 'dashboard' : 'home'
  const legalDocument = legalDocuments[location.pathname]

  const pathChannelId =
    route === 'dashboard' || location.pathname === '/' || legalDocument ? '' : location.pathname.slice(1)
  const channelId = pathChannelId || new URLSearchParams(location.search).get('channel_id') || ''

  const [channel, setChannel] = useState<ChannelInfo | null>(null)
  const [channelNotFound, setChannelNotFound] = useState(false)
  const [channelFailed, setChannelFailed] = useState(false)
  const [playbackStreamUrl, setPlaybackStreamUrl] = useState<string | null>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [userChecked, setUserChecked] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchableStreamer[]>([])

  const dashboardData = useDashboardData(route === 'dashboard')

  const spotifyAccessToken = route === 'dashboard' ? (dashboardData.playback.data?.access_token ?? null) : null
  const queueTracks = useMemo(
    () => normalizePlaybackTracks(dashboardData.playback.data?.playback_data),
    [dashboardData.playback.data?.playback_data],
  )
  const playback = usePlayback(
    route,
    spotifyAccessToken,
    queueTracks,
    playbackStreamUrl,
    (eventData) => void dashboardData.refetch.playbackPlaylist(eventData),
  )

  useEffect(() => {
    void getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setUserChecked(true))
  }, [])

  useEffect(() => {
    if (route === 'dashboard' && userChecked && !user) window.location.href = loginUrl()
  }, [route, userChecked, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChannel(null)
    setPlaybackStreamUrl(null)
    setChannelNotFound(false)
    setChannelFailed(false)
    if (!channelId) return

    let cancelled = false
    void getUserInfo(channelId)
      .then((userInfo) => {
        if (cancelled) return
        setChannel(userInfo.channel)
        setPlaybackStreamUrl(userInfo.playback ?? null)
      })
      .catch((error) => {
        if (cancelled) return
        if (axios.isAxiosError(error) && error.response?.status === 404) setChannelNotFound(true)
        else setChannelFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [channelId])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < minimumSearchLength) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchChannels(query)
        .then((results) => !cancelled && setSearchResults(results))
        .catch(() => !cancelled && setSearchResults([]))
    }, searchDebounceMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  const headerChannel = (route === 'dashboard' ? dashboardData.state.data?.channel : channel) ?? null
  const header = (
    <AppHeader
      user={user}
      route={route}
      streamerSelector={
        <StreamerSelector
          streamer={
            headerChannel && {
              name: headerChannel.channel_name || appName,
              avatarUrl: headerChannel.channel_image_url || defaultProfileImageUrl,
              isPartner: Boolean(headerChannel.is_verified),
              officialMarkUrl,
              label: route === 'dashboard' ? '대시보드' : undefined,
            }
          }
          searchQuery={searchQuery}
          filteredStreamers={searchQuery.trim().length >= minimumSearchLength ? searchResults : []}
          onSearchQueryChange={setSearchQuery}
        />
      }
    />
  )

  if (legalDocument) return <LegalPage header={header} document={legalDocument} />
  if (location.pathname === '/') return <LandingPage header={header} loading={!userChecked} />
  if (route === 'dashboard' && !user) return <PageLoading header={header} />
  if (channelNotFound) return <ChannelNotFound header={header} loading={!userChecked} />
  if (channelFailed) return <ErrorPage header={header} />

  const dashboardState = dashboardData.state
  if (route === 'dashboard' && dashboardState.failed) return <ErrorPage header={header} />
  const isDashboardRegistered = Boolean(dashboardState.data) && !('error' in (dashboardState.data ?? {}))

  const spotifyStatus: SpotifyStatus = spotifyAccessToken
    ? 'connected'
    : dashboardData.playback.data || dashboardData.playback.error
      ? 'disconnected'
      : 'checking'

  return (
    <Routes>
      <RouterRoute
        path="/:id"
        element={<HomePage header={header} playback={playback} loading={!userChecked || !channel} />}
      />
      <RouterRoute
        path="/dashboard"
        element={
          <>
            <DashboardPage
              header={header}
              playback={playback}
              spotifyStatus={spotifyStatus}
              loading={!dashboardState.checked}
            />
            {dashboardState.checked && !dashboardState.loading && !isDashboardRegistered && (
              <DashboardRegisterDialog onRegistered={() => void dashboardData.refetch.state()} />
            )}
          </>
        }
      />
      <RouterRoute path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
