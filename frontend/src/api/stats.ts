import { get } from './client'

export type RankingPeriod = 'day' | 'week' | 'month'

export type RankedTrack = {
  rank: number
  track_uri: string
  name: string
  artists: string[]
  image_url: string | null
  plays: number
}

export type BotStatus = {
  worker_online: boolean
  checked_at: string | null
  requests_today: number
  total_played: number
}

export function getTrackRanking(period: RankingPeriod): Promise<RankedTrack[]> {
  return get<RankedTrack[]>('/stats/ranking', { period })
}

export function getBotStatus(): Promise<BotStatus> {
  return get<BotStatus>('/stats/status')
}

export type ChatCommand = { key: string; value: string }

export function getCommands(): Promise<ChatCommand[]> {
  return get<ChatCommand[]>('/commands')
}
