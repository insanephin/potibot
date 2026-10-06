import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PopupContext, type ConfirmOptions, type PopupApi } from '@/hooks/use-popup'

type PopupRequest = ConfirmOptions & {
  kind: 'alert' | 'confirm'
  resolve: (confirmed: boolean) => void
}

export function PopupProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PopupRequest | null>(null)

  const currentRef = useRef<PopupRequest | null>(null)
  const queueRef = useRef<PopupRequest[]>([])

  const show = useCallback((request: PopupRequest | null) => {
    currentRef.current = request
    setCurrent(request)
  }, [])

  const enqueue = useCallback(
    (request: PopupRequest) => {
      if (currentRef.current) queueRef.current.push(request)
      else show(request)
    },
    [show],
  )

  const close = useCallback(
    (confirmed: boolean) => {
      const active = currentRef.current
      if (!active) return
      active.resolve(confirmed)
      show(queueRef.current.shift() ?? null)
    },
    [show],
  )

  const popup = useMemo<PopupApi>(
    () => ({
      alert: (title, description) =>
        new Promise<void>((resolve) => {
          enqueue({ kind: 'alert', title, description, resolve: () => resolve() })
        }),
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          enqueue({ kind: 'confirm', ...options, resolve })
        }),
    }),
    [enqueue],
  )

  return (
    <PopupContext.Provider value={popup}>
      {children}
      <AlertDialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) close(false)
        }}
      >
        {current && (
          <AlertDialogContent>
            <AlertDialogTitle>{current.title}</AlertDialogTitle>
            {current.description && <AlertDialogDescription>{current.description}</AlertDialogDescription>}
            <div className="mt-3 flex justify-end gap-2">
              {current.kind === 'confirm' && (
                <AlertDialogClose render={<Button type="button" variant="outline" />}>
                  {current.cancelLabel ?? '취소'}
                </AlertDialogClose>
              )}
              <Button
                type="button"
                variant={current.destructive ? 'destructive' : 'default'}
                onClick={() => close(true)}
                autoFocus
              >
                {current.confirmLabel ?? '확인'}
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </PopupContext.Provider>
  )
}
