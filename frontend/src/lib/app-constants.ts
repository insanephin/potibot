export const appName = '포티봇'
export const copyrightHolder = 'insanephin'

export const contactEmail = 'insanephin@gmail.com'

export const extensionStoreUrl = 'https://chromewebstore.google.com/detail/oagjjkagjahohhmojeiocpkcfmpbaiah'
export const spotifyWebPlayerUrl = 'https://open.spotify.com'

export const localPlaybackRequester = 'Spotify'

export function formatRequester(requester: string | undefined): string {
  return !requester || requester === localPlaybackRequester ? 'Spotify에서 재생' : `신청자: ${requester}`
}
export const defaultProfileImageUrl = 'https://ssl.pstatic.net/static/nng/glive/image/default_profile_dark.png'
export const officialMarkUrl = 'https://ssl.pstatic.net/static/nng/glive/image/icon_official_mark.png'

export const pageShellClassName =
  'mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 p-4 md:h-dvh md:min-h-[42rem] md:p-6 xl:max-w-6xl'
