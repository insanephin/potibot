import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { requestSpotifyAccess, type SpotifyAccess } from '@/api/spotify-access'
import { usePopup } from '@/hooks/use-popup'

type SpotifyAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEmail?: string
  onSubmitted: (access: SpotifyAccess) => void
}

export function SpotifyAccessDialog({ open, onOpenChange, initialEmail = '', onSubmitted }: SpotifyAccessDialogProps) {
  const [email, setEmail] = useState(initialEmail)

  const [seenInitialEmail, setSeenInitialEmail] = useState(initialEmail)
  if (initialEmail !== seenInitialEmail) {
    setSeenInitialEmail(initialEmail)
    if (!email) setEmail(initialEmail)
  }
  const [submitting, setSubmitting] = useState(false)
  const popup = usePopup()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      onSubmitted(await requestSpotifyAccess(email.trim()))
      onOpenChange(false)
      void popup.alert('사용 신청을 보냈습니다', '승인되면 설정에서 Spotify를 다시 연결해 주세요.')
    } catch {
      void popup.alert('신청하지 못했습니다', '이메일 주소를 확인하고 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
          <AlertDialogTitle>Spotify 사용 신청</AlertDialogTitle>
          <AlertDialogDescription>
            포티봇은 Spotify 승인을 받은 계정만 연결할 수 있습니다. Spotify 계정 이메일을 보내 주시면 관리자가 등록한 뒤
            연결할 수 있습니다.
          </AlertDialogDescription>
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Spotify 계정 이메일"
            autoComplete="email"
            className="mt-2 h-9"
          />
          <div className="mt-3 flex justify-end gap-2">
            <AlertDialogClose render={<Button type="button" variant="outline" />}>취소</AlertDialogClose>
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? '신청 중...' : '신청하기'}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
