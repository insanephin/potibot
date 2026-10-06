import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { authLinkProps } from '@/api/client'
import { deleteAccount } from '@/api/user'
import { Card } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import {
  disconnectSpotifyAccount,
  getChatbotSettings,
  getSpotifyAccount,
  updateChatbotSettings,
  type ChatbotSettings,
  type SpotifyAccount,
} from '@/api/dashboard'
import {
  cancelSpotifyAccess,
  deleteSpotifyApp,
  getSpotifyApp,
  type SpotifyAccess,
  type SpotifyApp,
} from '@/api/spotify-access'
import { DevicePicker } from '@/components/dashboard/device-list'
import { SpotifyAccessDialog } from '@/components/dashboard/spotify-access-dialog'
import { SpotifyAppDialog } from '@/components/dashboard/spotify-app-dialog'
import { Badge } from '@/components/shared/panel'
import { usePopup } from '@/hooks/use-popup'
import type { usePlayback } from '@/hooks/use-playback'

function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function spotifyTitle(account: SpotifyAccount | null, access: SpotifyAccess | null) {
  if (!account?.connected)
    return (
      <>
        <img src="/spotify/full-logo.svg" alt="Spotify" className="h-5 w-auto" />
        {access?.status === 'pending' && <Badge tone="primary">승인 대기 중</Badge>}
      </>
    )
  return (
    <>
      <img src="/spotify/icon.svg" alt="Spotify" className="size-4 shrink-0" />
      <span className="truncate">{account.display_name ?? '알 수 없음'}</span>
    </>
  )
}

const accessDescriptions: Record<SpotifyAccess['status'], string | null> = {
  none: null,
  pending: '승인되면 연결을 눌러 주세요.',
  approved: '사용이 승인되었습니다. 연결을 눌러 주세요.',
  rejected: '사용 신청이 거절되었습니다.',
}

function spotifyDescription(account: SpotifyAccount | null, access: SpotifyAccess | null) {
  if (!account) return '확인 중'
  if (!account.connected) {
    const text = access && accessDescriptions[access.status]
    return text && (access.email ? `${text} (${access.email})` : text)
  }
  const warning = account.reauth_required
    ? '인증이 만료되었습니다. 다시 연결해 주세요.'
    : account.product && account.product !== 'premium'
      ? '대기열 추가와 재생 조작은 Premium 계정만 가능합니다.'
      : null
  return (
    <>
      {account.product}
      {warning && <span className="mt-0.5 block text-destructive">{warning}</span>}
    </>
  )
}

type SettingsViewProps = {
  playback?: ReturnType<typeof usePlayback>

  promptAccessRequest: boolean
  access: SpotifyAccess | null
  onAccessChange: (access: SpotifyAccess) => void

  onAccountDeleted?: () => void | Promise<void>
}

export function SettingsView({
  playback,
  promptAccessRequest,
  access,
  onAccessChange,
  onAccountDeleted = () => window.location.assign('/'),
}: SettingsViewProps) {
  const [settings, setSettings] = useState<ChatbotSettings | null>(null)
  const [account, setAccount] = useState<SpotifyAccount | null>(null)
  const [app, setApp] = useState<SpotifyApp | null>(null)
  const [appDialogOpen, setAppDialogOpen] = useState(false)
  const [accessDialogOpen, setAccessDialogOpen] = useState(promptAccessRequest)
  const [disconnecting, setDisconnecting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const confirmedSettingsRef = useRef<ChatbotSettings | null>(null)
  const saveSequenceRef = useRef(0)
  const popup = usePopup()

  useEffect(() => {
    void getChatbotSettings()
      .then((loaded) => {
        confirmedSettingsRef.current = loaded
        setSettings(loaded)
      })
      .catch(() => void popup.alert('설정을 불러오지 못했습니다', '잠시 후 다시 시도해 주세요.'))
    void getSpotifyAccount()
      .then(setAccount)
      .catch(() => setAccount({ connected: false }))
    void getSpotifyApp()
      .then(setApp)
      .catch(() => setApp(null))
  }, [popup])

  const removeApp = async () => {
    const confirmed = await popup.confirm({
      title: '내 Spotify 앱을 해제할까요?',
      description: '공용 앱으로 돌아가며, 현재 Spotify 연결도 해제되어 다시 연결해야 합니다.',
      confirmLabel: '해제',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteSpotifyApp()
      window.location.reload()
    } catch {
      void popup.alert('앱을 해제하지 못했습니다', '잠시 후 다시 시도해 주세요.')
    }
  }

  const cancelAccess = async () => {
    try {
      onAccessChange(await cancelSpotifyAccess())
    } catch {
      void popup.alert('신청을 취소하지 못했습니다', '잠시 후 다시 시도해 주세요.')
    }
  }

  const saveSettings = async (changes: Partial<ChatbotSettings>) => {
    if (!settings) return
    const sequence = ++saveSequenceRef.current
    setSettings((current) => current && { ...current, ...changes })
    try {
      const saved = await updateChatbotSettings(changes)
      confirmedSettingsRef.current = saved
      if (sequence === saveSequenceRef.current) setSettings(saved)
    } catch {
      if (sequence === saveSequenceRef.current) setSettings(confirmedSettingsRef.current)
      void popup.alert('설정을 저장하지 못했습니다', '변경 전 설정으로 되돌렸습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const disconnect = async () => {
    const confirmed = await popup.confirm({
      title: 'Spotify 연결을 해제할까요?',
      description: '연결을 해제하면 신청곡이 Spotify 대기열에 추가되지 않습니다.',
      confirmLabel: '연결 해제',
      destructive: true,
    })
    if (!confirmed) return
    setDisconnecting(true)
    try {
      await disconnectSpotifyAccount()
      window.location.reload()
    } catch {
      setDisconnecting(false)
      void popup.alert('연결을 해제하지 못했습니다', '잠시 후 다시 시도해 주세요.')
    }
  }

  const removeAccount = async () => {
    const confirmed = await popup.confirm({
      title: '회원 탈퇴할까요?',
      description:
        '봇이 채팅에서 나가고, 설정·신청곡 기록·Spotify 연결 등 저장된 정보가 모두 삭제됩니다. 삭제된 정보는 되돌릴 수 없습니다.',
      confirmLabel: '탈퇴',
      destructive: true,
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteAccount()
    } catch {
      setDeleting(false)
      void popup.alert('탈퇴하지 못했습니다', '잠시 후 다시 시도해 주세요.')
      return
    }
    await popup.alert('탈퇴했습니다', '그동안 이용해 주셔서 감사합니다.')
    await onAccountDeleted()
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-4 overflow-auto">
      <Card className="h-fit w-full shrink-0 divide-y divide-border">
        <SettingRow title="신청곡 받기" description="봇이 명령어에 반응할지 여부를 결정합니다.">
          <Toggle
            value={settings?.requests_enabled ?? false}
            disabled={!settings}
            label="신청곡 받기"
            onChange={() => void saveSettings({ requests_enabled: !settings?.requests_enabled })}
          />
        </SettingRow>
        {playback && (
          <SettingRow
            title="재생 기기"
            description={
              settings?.preferred_device
                ? `${settings.preferred_device.name} · 재생 중인 기기가 없으면 이 기기로 자동 연결합니다.`
                : 'PC 앱이나 웹 플레이어를 선택하면 신청곡이 그 기기의 대기열에 추가됩니다.'
            }
          >
            {settings?.preferred_device && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void saveSettings({ preferred_device: null })}
              >
                해제
              </Button>
            )}
            <DevicePicker
              label={settings?.preferred_device?.name ?? '없음'}
              devices={playback.devices}
              onRefresh={() => void playback.refreshDevices()}
              onSelect={async (device) => {
                if (!(await playback.selectDevice(device))) return

                const preferred_device = { id: device.id, name: device.name, type: device.type }
                if (confirmedSettingsRef.current)
                  confirmedSettingsRef.current = { ...confirmedSettingsRef.current, preferred_device }
                setSettings((current) => current && { ...current, preferred_device })
              }}
            />
          </SettingRow>
        )}
        <SettingRow title={spotifyTitle(account, access)} description={spotifyDescription(account, access)}>
          {account && !account.connected && !app?.configured && access?.status === 'pending' && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void cancelAccess()}>
              신청 취소
            </Button>
          )}
          {account &&
            !account.connected &&
            !app?.configured &&
            (access?.status === 'none' || access?.status === 'rejected') && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAccessDialogOpen(true)}>
                사용 신청
              </Button>
            )}
          {account?.connected && (
            <Button
              type="button"
              variant="ghost-destructive"
              size="sm"
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              연결 해제
            </Button>
          )}
          <a {...authLinkProps('/spotify/login')} className={buttonVariants({ variant: 'spotify', size: 'sm' })}>
            {account?.connected ? '재연결' : '연결'}
          </a>
        </SettingRow>
        <SettingRow
          title="내 Spotify 앱"
          description={
            app?.configured
              ? `Client ID ${app.client_id?.slice(0, 6)}… · 이 앱으로 Spotify에 연결합니다.`
              : '직접 만든 Spotify 개발자 앱을 등록하면 사용 승인 없이 연결할 수 있습니다.'
          }
        >
          {app?.configured && (
            <Button type="button" variant="ghost-destructive" size="sm" onClick={() => void removeApp()}>
              해제
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={!app} onClick={() => setAppDialogOpen(true)}>
            {app?.configured ? '변경' : '등록'}
          </Button>
        </SettingRow>
      </Card>
      <Card className="h-fit w-full shrink-0">
        <SettingRow title="회원 탈퇴" description="저장된 모든 정보를 삭제하고 봇 연결을 끊습니다.">
          <Button
            type="button"
            variant="ghost-destructive"
            size="sm"
            onClick={() => void removeAccount()}
            disabled={deleting}
          >
            탈퇴
          </Button>
        </SettingRow>
      </Card>
      <SpotifyAccessDialog
        open={accessDialogOpen}
        onOpenChange={setAccessDialogOpen}
        initialEmail={access?.email}
        onSubmitted={onAccessChange}
      />
      {app && <SpotifyAppDialog open={appDialogOpen} onOpenChange={setAppDialogOpen} app={app} onSaved={setApp} />}
    </div>
  )
}
