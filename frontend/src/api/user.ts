import type { ChannelInfo, User } from '@/types/chzzk'
import type { SearchableStreamer } from '@/types/app'
import { defaultProfileImageUrl } from '@/lib/app-constants'
import { del, get, post } from './client'

export type CurrentUser = {
  channel_name: string | null
  channel_image_url: string | null
}

export function getCurrentUser(): Promise<CurrentUser> {
  return get<CurrentUser>('/me')
}

export function logout(): Promise<{ message: string }> {
  return post<{ message: string }>('/logout')
}

export function deleteAccount(): Promise<{ message: string }> {
  return del<{ message: string }>('/me')
}

type ChannelSearchResult = {
  channel_id: string
  channel_name: string
  channel_image_url?: string | null
  is_verified?: boolean
}

const searchMinimumQueryLength = 2
const searchCacheTtlMs = 3_000
const channelSearchCache = new Map<string, { expiresAt: number; results: SearchableStreamer[] }>()

export async function searchChannels(query: string): Promise<SearchableStreamer[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < searchMinimumQueryLength) return []

  const cached = channelSearchCache.get(normalizedQuery)
  if (cached && cached.expiresAt > Date.now()) return cached.results
  if (cached) channelSearchCache.delete(normalizedQuery)

  const response = await get<ChannelSearchResult[]>('/search', { q: normalizedQuery })
  const results = response.map((channel) => ({
    channelId: channel.channel_id,
    name: channel.channel_name,
    avatarUrl: channel.channel_image_url || defaultProfileImageUrl,
    isPartner: Boolean(channel.is_verified),
  }))
  channelSearchCache.set(normalizedQuery, {
    expiresAt: Date.now() + searchCacheTtlMs,
    results,
  })
  return results
}

export async function getUserInfo(channelId: string): Promise<User> {
  const response = await get<{ channel?: Partial<ChannelInfo>; playback?: unknown }>('/chzzk/channel', {
    channel_id: channelId,
  })
  return {
    channel: {
      channel_name: response.channel?.channel_name ?? null,
      channel_image_url: response.channel?.channel_image_url ?? null,
      is_verified: Boolean(response.channel?.is_verified),
    },
    playback: typeof response.playback === 'string' ? response.playback : null,
  }
}
