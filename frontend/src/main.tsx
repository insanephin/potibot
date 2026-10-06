import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { PopupProvider } from '@/components/popup-provider'
import { ErrorBoundary } from '@/components/app/error-page'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PopupProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </PopupProvider>
    </BrowserRouter>
  </StrictMode>,
)
