import { useEffect, useState } from 'react'
import { getSpotifyAccess, type SpotifyAccess } from '@/api/spotify-access'

export function useSpotifyAccess() {
  const [access, setAccess] = useState<SpotifyAccess | null>(null)

  useEffect(() => {
    void getSpotifyAccess()
      .then(setAccess)
      .catch(() => setAccess(null))
  }, [])

  return { access, setAccess }
}
