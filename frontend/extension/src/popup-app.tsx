import { useEffect, useState } from 'react'
import { LogOut, User as UserIcon } from 'lucide-react'
import { authLinkProps } from '@/api/client'
import { getDashboardState } from '@/api/dashboard'
import { getCurrentUser, logout, type CurrentUser } from '@/api/user'
import { DashboardRegisterDialog } from '@/components/dashboard/register-dialog'
import { SettingsView } from '@/components/dashboard/settings-view'
import { LoadingOverlay } from '@/components/shared/panel'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card } from '@/components/ui/card'
import { usePopup } from '@/hooks/use-popup'
import { useSpotifyAccess } from '@/hooks/use-spotify-access'
import { appName, defaultProfileImageUrl } from '@/lib/app-constants'
import { cn } from '@/lib/utils'
import { storageKeys, type AuthResult } from './shared'

const popupShellClassName = 'flex max-h-[600px] min-h-[24rem] w-full flex-col gap-3 p-3'

const quietLoginErrors = new Set(['cancelled', 'access_denied'])
const reportLoginError = (error?: string) => Boolean(error && !quietLoginErrors.has(error))

function PopupHeader({ user }: { user: CurrentUser }) {
  const popup = usePopup()

  const handleLogout = async () => {
    const confirmed = await popup.confirm({
      title: '로그아웃할까요?',
      description: '확장 프로그램에서 로그아웃하고 이 세션을 만료시킵니다.',
      confirmLabel: '로그아웃',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await logout()
    } finally {
      await chrome.storage.local.remove(storageKeys.token)
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5">
      <Avatar className="size-9">
        <AvatarImage src={user.channel_image_url || defaultProfileImageUrl} alt={user.channel_name || appName} />
        <AvatarFallback>
          <UserIcon className="size-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.channel_name ?? appName}</p>
        <p className="text-xs text-muted-foreground">치지직 계정 연결됨</p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={() => void handleLogout()} aria-label="로그아웃">
        <LogOut />
      </Button>
    </header>
  )
}

function SignedOut() {
  return (
    <div className={popupShellClassName}>
      <Card className="m-auto w-full items-center gap-2 p-6 text-center">
        <img src="/icon/potibot.png" alt="" className="size-14" />
        <h1 className="mt-2 text-lg font-semibold tracking-tight">{appName}</h1>
        <p className="text-sm text-muted-foreground">
          치지직 계정으로 로그인하면 Spotify 대기열에 신청곡이 표시되고, 여기서 설정을 관리할 수 있습니다.
        </p>
        <a
          {...authLinkProps('/chzzk/login')}
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-4')}
        >
          <img src="/chzzk/white.png" alt="Chzzk" className="h-4 w-auto object-contain" />
          로그인
        </a>
      </Card>
    </div>
  )
}

function useRegistered() {
  const [registered, setRegistered] = useState<boolean | null>(null)
  useEffect(() => {
    void fetchRegistered().then(setRegistered)
  }, [])
  return { registered, recheck: () => fetchRegistered().then(setRegistered) }
}

const fetchRegistered = () =>
  getDashboardState()
    .then((state) => !('error' in state))
    .catch(() => null)

function SignedIn({ user, authResult }: { user: CurrentUser; authResult: AuthResult | null }) {
  const { registered, recheck } = useRegistered()
  const { access, setAccess } = useSpotifyAccess()
  const popup = usePopup()
  const spotifyError = authResult?.provider === 'spotify' ? authResult.error : undefined

  useEffect(() => {
    if (spotifyError === 'app_forbidden')
      void popup.alert(
        'Spotify 앱에 계정을 추가해 주세요',
        '등록한 앱의 User Management에 연결하려는 Spotify 계정의 이메일을 추가한 뒤 다시 연결해 주세요.',
      )
    else if (spotifyError !== 'access_required' && reportLoginError(spotifyError))
      void popup.alert('Spotify에 연결하지 못했습니다', '잠시 후 다시 시도해 주세요.')
  }, [spotifyError, popup])

  return (
    <div className={popupShellClassName}>
      <PopupHeader user={user} />
      <SettingsView
        promptAccessRequest={spotifyError === 'access_required'}
        access={access}
        onAccessChange={setAccess}
        onAccountDeleted={() => chrome.storage.local.remove(storageKeys.token)}
      />
      {registered === false && <DashboardRegisterDialog onRegistered={() => void recheck()} />}
    </div>
  )
}

async function takeAuthResult(): Promise<AuthResult | null> {
  const stored = await chrome.storage.session.get(storageKeys.authResult)
  await chrome.storage.session.remove(storageKeys.authResult)
  return (stored[storageKeys.authResult] as AuthResult | undefined) ?? null
}

export function PopupApp() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [authResult, setAuthResult] = useState<AuthResult | null>(null)
  const [checked, setChecked] = useState(false)
  const popup = usePopup()

  useEffect(() => {
    void Promise.all([getCurrentUser().catch(() => null), takeAuthResult().catch(() => null)]).then(
      ([currentUser, result]) => {
        setUser(currentUser)
        setAuthResult(result)
        setChecked(true)
      },
    )
  }, [])

  useEffect(() => {
    if (authResult?.provider === 'chzzk' && reportLoginError(authResult.error))
      void popup.alert('치지직에 로그인하지 못했습니다', '잠시 후 다시 시도해 주세요.')
  }, [authResult, popup])

  useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        (area === 'local' && storageKeys.token in changes) ||
        (area === 'session' && changes[storageKeys.authResult]?.newValue)
      )
        window.location.reload()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  if (!checked)
    return (
      <div className={popupShellClassName}>
        <LoadingOverlay show />
      </div>
    )
  return user ? <SignedIn user={user} authResult={authResult} /> : <SignedOut />
}
