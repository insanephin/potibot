export interface ChannelInfo {
  channel_name: string | null
  channel_image_url: string | null
  is_verified: boolean
}

export interface User {
  channel: ChannelInfo
  playback?: string | null
}
