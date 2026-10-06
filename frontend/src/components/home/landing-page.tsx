import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Trophy } from 'lucide-react'
import { AppFooter } from '@/components/app/app-footer'
import { EmptyState, LoadingOverlay, PanelHeader, Segmented } from '@/components/shared/panel'
import { TrackList, TrackRow } from '@/components/shared/track-row'
import { Card } from '@/components/ui/card'
import {
  getBotStatus,
  getCommands,
  getTrackRanking,
  type BotStatus,
  type ChatCommand,
  type RankedTrack,
  type RankingPeriod,
} from '@/api/stats'
import { cn } from '@/lib/utils'
import { pageShellClassName } from '@/lib/app-constants'

const STATUS_REFRESH_MS = 30_000

const periods: { key: RankingPeriod; label: string }[] = [
  { key: 'day', label: '일간' },
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
]

type Ranking = Record<RankingPeriod, RankedTrack[] | undefined>

export function LandingPage({ header, loading }: { header: ReactNode; loading: boolean }) {
  const [period, setPeriod] = useState<RankingPeriod>('day')
  const [ranking, setRanking] = useState<Ranking>({ day: undefined, week: undefined, month: undefined })
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)
  const [commands, setCommands] = useState<ChatCommand[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void getTrackRanking(period)
      .then((result) => !cancelled && setRanking((current) => ({ ...current, [period]: result })))
      .catch(() => !cancelled && setRanking((current) => ({ ...current, [period]: [] })))
    return () => {
      cancelled = true
    }
  }, [period])

  useEffect(() => {
    const load = () =>
      void getBotStatus()
        .then((result) => {
          setStatus(result)
          setStatusFailed(false)
        })
        .catch(() => setStatusFailed(true))
    load()
    const timer = window.setInterval(load, STATUS_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    void getCommands()
      .then(setCommands)
      .catch(() => setCommands([]))
  }, [])

  const firstLoad = ranking.day === undefined || (!status && !statusFailed) || commands === null

  return (
    <div className={pageShellClassName}>
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <RankingCard period={period} onPeriodChange={setPeriod} tracks={ranking[period]} />
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <StatusCard status={status} failed={statusFailed} />
          <CommandsCard commands={commands ?? []} />
        </div>
      </div>
      <AppFooter />
      <LoadingOverlay show={loading || firstLoad} />
    </div>
  )
}

type RankingCardProps = {
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
  tracks: RankedTrack[] | undefined
}

function RankingCard({ period, onPeriodChange, tracks }: RankingCardProps) {
  return (
    <Card className="min-h-96 min-w-0 md:min-h-0">
      <PanelHeader title="통합 재생 순위">
        <Segmented items={periods} value={period} onChange={onPeriodChange} />
      </PanelHeader>
      {tracks === undefined ? (
        <EmptyState icon={Loader2} title="불러오는 중" loading />
      ) : tracks.length === 0 ? (
        <EmptyState icon={Trophy} title="아직 재생된 신청곡이 없습니다" />
      ) : (
        <TrackList>
          {tracks.map((track) => (
            <TrackRow
              key={track.track_uri}
              index={<span className={cn(track.rank <= 3 && 'font-semibold text-primary')}>{track.rank}</span>}
              imageUrl={track.image_url}
              title={track.name}
              subtitle={track.artists.join(', ') || '아티스트 알 수 없음'}
              trailing={<span className="tabular-nums">{track.plays}회</span>}
            />
          ))}
        </TrackList>
      )}
    </Card>
  )
}

function StatusCard({ status, failed }: { status: BotStatus | null; failed: boolean }) {
  const online = !failed && Boolean(status?.worker_online)
  const stats = status
    ? [
        { label: '오늘 신청곡', value: status.requests_today },
        { label: '누적 재생곡', value: status.total_played },
      ]
    : []

  return (
    <Card className="min-w-0 shrink-0">
      <PanelHeader title="봇 상태" />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
          <span
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              status || failed
                ? online
                  ? 'bg-primary shadow-[0_0_0_4px] shadow-primary/20'
                  : 'bg-destructive'
                : 'bg-muted-foreground',
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {!status && !failed ? '확인 중' : online ? '정상 작동 중' : '연결 끊김'}
            </p>
            <p className="text-xs text-muted-foreground">
              {failed
                ? '서버에 연결할 수 없습니다'
                : status?.checked_at
                  ? `마지막 확인 ${new Date(status.checked_at).toLocaleTimeString('ko-KR')}`
                  : '채팅 봇 응답 대기 중'}
            </p>
          </div>
        </div>
        {stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-lg border border-border px-4 py-3">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Card>
  )
}

function CommandsCard({ commands }: { commands: ChatCommand[] }) {
  return (
    <Card className="min-h-0 min-w-0 flex-1">
      <PanelHeader title="명령어" />
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto px-5">
        {commands.map((command) => (
          <li key={command.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <code className="w-28 shrink-0 font-mono text-sm font-semibold text-primary">!{command.key}</code>
            <span className="text-sm text-muted-foreground">{command.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
