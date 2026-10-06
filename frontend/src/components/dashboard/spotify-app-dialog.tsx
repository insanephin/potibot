import { useState, type FormEvent } from 'react'
import { Copy, ExternalLink, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { saveSpotifyApp, type SpotifyApp } from '@/api/spotify-access'
import { usePopup } from '@/hooks/use-popup'
import axios from 'axios'

type SpotifyAppDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  app: SpotifyApp | null
  onSaved: (app: SpotifyApp) => void
}

const warnings = [
  'Client Secret은 비밀번호와 같습니다. 방송 화면이나 채팅, 다른 사람에게 절대 노출하지 마세요.',
  '노출됐다면 Spotify 개발자 대시보드에서 Secret을 재발급한 뒤 여기서 다시 등록해 주세요.',
  '앱 소유자가 아닌 Spotify 계정으로 연결하려면 앱의 User Management에 그 계정을 추가해야 합니다.',
  '앱을 등록·변경·해제하면 기존 Spotify 연결이 해제되어 다시 연결해야 합니다.',
  '앱 운영과 Spotify 개발자 약관 준수는 앱 소유자의 책임입니다.',
]

const errorMessages: Record<string, string> = {
  invalid_format: 'Client ID와 Client Secret은 32자리 영문·숫자입니다.',
  invalid_credentials: 'Spotify가 이 Client ID와 Secret을 거부했습니다. 값을 다시 확인해 주세요.',
}

export function SpotifyAppDialog({ open, onOpenChange, app, onSaved }: SpotifyAppDialogProps) {
  const [clientId, setClientId] = useState(app?.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const popup = usePopup()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      onSaved(await saveSpotifyApp(clientId.trim(), clientSecret.trim()))
      setClientSecret('')
      onOpenChange(false)
      void popup.alert('내 Spotify 앱을 등록했습니다', '이제 Spotify를 연결하면 이 앱으로 연결됩니다.')
    } catch (error) {
      const code = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error
        : undefined
      void popup.alert('앱을 등록하지 못했습니다', errorMessages[code ?? ''] ?? '잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(28rem,calc(100vw-2rem))]">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
          <AlertDialogTitle>내 Spotify 앱 사용</AlertDialogTitle>
          <AlertDialogDescription>
            Spotify 개발자 대시보드에서 앱을 만들고 아래 Redirect URI를 등록한 뒤, Client ID와 Client Secret을 입력해
            주세요. 사용 승인 없이 바로 연결할 수 있습니다.
          </AlertDialogDescription>
          <a
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Spotify 개발자 대시보드 열기
            <ExternalLink className="size-3.5" />
          </a>
          {app && (
            <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Redirect URI
              <div className="flex gap-2">
                <Input value={app.redirect_uri} readOnly className="h-9 font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Redirect URI 복사"
                  onClick={() => void navigator.clipboard.writeText(app.redirect_uri).catch(() => undefined)}
                >
                  <Copy />
                </Button>
              </div>
            </label>
          )}
          <label className="mt-1 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Client ID
            <Input
              required
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-9 font-mono"
            />
          </label>
          <label className="mt-1 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Client Secret
            <Input
              required
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="off"
              className="h-9 font-mono"
            />
          </label>
          <div
            role="note"
            className="mt-2 flex gap-2.5 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <ul className="flex list-disc flex-col gap-1 pl-3.5 leading-5 break-keep">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <AlertDialogClose render={<Button type="button" variant="outline" />}>취소</AlertDialogClose>
            <Button type="submit" disabled={saving || !clientId.trim() || !clientSecret.trim()}>
              {saving ? '확인 중...' : '등록'}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
