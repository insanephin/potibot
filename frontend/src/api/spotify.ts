export type SpotifyDevice = {
  id: string
  name: string
  type: string
  is_active: boolean
  volume_percent: number | null
  supports_volume: boolean
}

export const isSelectableDevice = (device: SpotifyDevice) => device.type.toLowerCase() === 'computer'

export type SpotifyPlayerState = {
  device: SpotifyDevice | null
  is_playing: boolean
  progress_ms: number | null
  item: {
    id: string
    uri: string
    name: string
    duration_ms: number
    artists: Array<{ name: string }>
    album?: { name?: string; images?: Array<{ url: string }> }
  } | null
}

async function spotifyRequest(
  accessToken: string,
  path: string,
  action: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`https://api.spotify.com/v1/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  })
  if (!response.ok) throw new Error(`Spotify API ${response.status}: ${action} failed`)
  return response
}

export async function getSpotifyPlayerState(accessToken: string): Promise<SpotifyPlayerState | null> {
  const response = await spotifyRequest(accessToken, '/player', 'player state request')
  return response.status === 204 ? null : response.json()
}

export async function getSpotifyDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const response = await spotifyRequest(accessToken, '/player/devices', 'devices request')
  const data = (await response.json()) as { devices?: SpotifyDevice[] }
  return (data.devices ?? []).filter((device) => Boolean(device.id))
}

export async function getSpotifyQueue(
  accessToken: string,
): Promise<{ currentUri: string | null; queueUris: string[] }> {
  const response = await spotifyRequest(accessToken, '/player/queue', 'queue request')
  const data = (await response.json()) as {
    currently_playing?: { uri?: string } | null
    queue?: Array<{ uri?: string } | null>
  }
  return {
    currentUri: data.currently_playing?.uri ?? null,
    queueUris: (data.queue ?? []).flatMap((track) => (track?.uri ? [track.uri] : [])),
  }
}

export async function addSpotifyTrackToQueue(accessToken: string, uri: string, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ uri, ...(deviceId ? { device_id: deviceId } : {}) })
  await spotifyRequest(accessToken, `/player/queue?${params}`, 'add to queue', { method: 'POST' })
}

export async function skipSpotifyTrack(accessToken: string, direction: 'next' | 'previous'): Promise<void> {
  await spotifyRequest(accessToken, `/player/${direction}`, 'track skip', { method: 'POST' })
}

export async function pauseSpotifyPlayback(accessToken: string): Promise<void> {
  await spotifyRequest(accessToken, '/player/pause', 'playback pause', { method: 'PUT' })
}

export async function resumeSpotifyPlayback(accessToken: string): Promise<void> {
  await spotifyRequest(accessToken, '/player/play', 'playback resume', { method: 'PUT' })
}

export async function transferSpotifyPlayback(accessToken: string, deviceId: string): Promise<void> {
  await spotifyRequest(accessToken, '/player', 'playback transfer', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  })
}
