import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './popup.css'
import { configureApi } from '@/api/client'
import { PopupProvider } from '@/components/popup-provider'
import { PopupApp } from './popup-app'
import { apiOrigin, readSessionToken, type AuthProvider, type ExtensionMessage } from './shared'

configureApi({
  origin: apiOrigin,
  getToken: readSessionToken,

  openAuthPage: (path) => {
    const provider: AuthProvider = path.startsWith('/spotify/') ? 'spotify' : 'chzzk'
    const message: ExtensionMessage = { type: 'login', provider }
    void chrome.runtime.sendMessage(message)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupProvider>
      <PopupApp />
    </PopupProvider>
  </StrictMode>,
)
