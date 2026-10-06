export type ToastTone = 'success' | 'warning'

const visibleMs = 5_000
const toneColors: Record<ToastTone, string> = { success: '#1ed760', warning: '#f5a623' }

const styles = `
  :host { all: initial; }
  .toast {
    position: fixed; top: 72px; right: 16px; z-index: 2147483647;
    display: flex; align-items: center; gap: 12px;
    box-sizing: border-box; width: 320px; max-width: calc(100vw - 32px); padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.1); border-left: 3px solid var(--tone); border-radius: 8px;
    background: #1f1f1f; color: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    font: 13px/1.4 'Pretendard Variable', system-ui, -apple-system, sans-serif;
    cursor: pointer; opacity: 0; transform: translateY(-8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .toast.shown { opacity: 1; transform: none; }
  img { flex: none; width: 32px; height: 32px; border-radius: 8px; }
  .text { min-width: 0; flex: 1; }
  .title { font-weight: 700; color: var(--tone); }
  .detail { margin-top: 2px; color: #b3b3b3; overflow-wrap: anywhere; }
  .close { flex: none; color: #b3b3b3; font-size: 16px; line-height: 1; }
  @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
`

let current: HTMLElement | null = null

export function showToast({
  title,
  detail,
  tone,
  iconUrl,
}: {
  title: string
  detail: string
  tone: ToastTone
  iconUrl: string
}) {
  current?.remove()
  const host = document.createElement('div')
  host.setAttribute('data-potibot-toast', '')
  const root = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = styles
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.setAttribute('role', 'status')
  toast.style.setProperty('--tone', toneColors[tone])

  const icon = document.createElement('img')
  icon.src = iconUrl
  icon.alt = ''
  const text = document.createElement('div')
  text.className = 'text'
  const titleElement = document.createElement('div')
  titleElement.className = 'title'
  titleElement.textContent = title
  const detailElement = document.createElement('div')
  detailElement.className = 'detail'
  detailElement.textContent = detail
  text.append(titleElement, detailElement)
  const close = document.createElement('span')
  close.className = 'close'
  close.setAttribute('aria-hidden', 'true')
  close.textContent = '×'
  toast.append(icon, text, close)
  root.append(style, toast)
  document.body.append(host)
  current = host

  const dismiss = () => {
    toast.classList.remove('shown')
    window.setTimeout(() => host.remove(), 200)
    if (current === host) current = null
  }
  toast.addEventListener('click', dismiss)
  window.setTimeout(dismiss, visibleMs)
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('shown')))
}
