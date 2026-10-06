import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card } from '@/components/ui/card'
import { extensionStoreUrl, spotifyWebPlayerUrl } from '@/lib/app-constants'

const dismissedAtKey = 'extension-tip-dismissed-at'
const snoozeMs = 7 * 24 * 60 * 60 * 1000
const showDelayMs = 3_000

const canInstallExtension = () =>
  'chrome' in window && window.matchMedia('(min-width: 768px) and (pointer: fine)').matches

const extensionInstalled = () => document.documentElement.hasAttribute('data-potibot-extension')

function readDismissedAt() {
  try {
    return Number(localStorage.getItem(dismissedAtKey)) || 0
  } catch {
    return 0
  }
}

export function ExtensionTip() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!canInstallExtension() || Date.now() - readDismissedAt() < snoozeMs) return
    const timer = window.setTimeout(() => setOpen(!extensionInstalled()), showDelayMs)
    return () => window.clearTimeout(timer)
  }, [])

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(dismissedAtKey, String(Date.now()))
    } catch {
    }
  }

  if (!open) return null
  return (
    <Card
      role="complementary"
      aria-label="확장 프로그램 안내"
      className="fixed right-4 bottom-4 z-30 w-[22rem] max-w-[calc(100vw-2rem)] gap-3 p-4 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-start gap-3">
        <img src="/icon/potibot.png" alt="" className="size-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">웹 플레이어에서 신청자를 확인하세요</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Spotify 웹 플레이어와 확장 프로그램을 함께 사용하면 대기열의 신청곡 옆에 신청자가 표시됩니다.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-1"
          onClick={dismiss}
          aria-label="닫기"
        >
          <X />
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <a
          href={spotifyWebPlayerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          웹 플레이어 열기
        </a>
        <a
          href={extensionStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'spotify', size: 'sm' })}
        >
          확장 프로그램 설치
        </a>
      </div>
    </Card>
  )
}
