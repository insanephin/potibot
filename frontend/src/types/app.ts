export type Route = 'home' | 'dashboard'
export type SpotifyStatus = 'checking' | 'connected' | 'disconnected'

export type QueueTrack = {
  id: string
  title: string
  artist: string
  duration: string
  requester: string
  imageUrl?: string
  uri?: string
  album?: string
  elapsed?: string
  progressPercent?: number
}

export type Streamer = {
  name: string
  avatarUrl: string
  isPartner: boolean
  officialMarkUrl: string

  label?: string
}

export type SearchableStreamer = {
  channelId?: string
  name: string
  avatarUrl: string
  isPartner: boolean
}
