import { createContext, useContext } from 'react'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export type PopupApi = {
  alert: (title: string, description?: string) => Promise<void>

  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const PopupContext = createContext<PopupApi | null>(null)

export function usePopup(): PopupApi {
  const popup = useContext(PopupContext)
  if (!popup) throw new Error('usePopup must be used inside <PopupProvider>')
  return popup
}
