import type { SongRequest } from '@/api/dashboard'
import type { ExtensionMessage, PendingRequestsResponse, StatusResponse } from './shared'
import { showToast } from './toast'

const pollIntervalMs = 10_000

const queueChangeRefreshMs = 2_000
const tokenStorageKey = 'token'
const badgeAttribute = 'data-potibot-request'

const rowSelector = '[data-encore-id="listRow"][aria-labelledby^="listrow-title-"]'

const sectionListSelector = '[aria-rowcount][aria-colcount]'
const iconUrl = chrome.runtime.getURL('icon/potibot.png')

let requests: SongRequest[] = []
let stopped = false
let lastQueueSignature = ''
let lastStatus = ''

const normalize = (text: string | null | undefined) => (text ?? '').normalize('NFC').trim().toLowerCase()

type QueueRow = { element: HTMLElement; title: string; artists: string[]; trackUri: string | null; subtitle: Element }

function readRow(element: HTMLElement): QueueRow | null {
  const labelId = element.getAttribute('aria-labelledby') ?? ''
  const titleElement = document.getElementById(labelId)
  const artistLinks = [...element.querySelectorAll<HTMLAnchorElement>('a[href*="/artist/"]')]

  if (!titleElement || artistLinks.length === 0) return null
  const subtitle = artistLinks[0].closest('[data-encore-id="text"]') ?? artistLinks[0].parentElement
  if (!subtitle) return null

  const trackUri = /spotify:track:[A-Za-z0-9]+/.exec(labelId)?.[0] ?? null
  return {
    element,
    title: normalize(titleElement.textContent),
    artists: artistLinks.map((link) => normalize(link.textContent)),
    trackUri,
    subtitle,
  }
}

function matches(row: QueueRow, request: SongRequest) {
  if (row.trackUri) return row.trackUri === request.track_uri
  return (
    normalize(request.name) === row.title && request.artists.some((artist) => row.artists.includes(normalize(artist)))
  )
}

function createBadge(request: SongRequest) {
  const badge = document.createElement('span')
  badge.setAttribute(badgeAttribute, String(request.id))
  badge.title = `포티봇 신청곡 · ${request.requester_name ?? '알 수 없음'}`
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
    'margin-inline-end:6px',
    'padding:0 6px 0 3px',
    'border-radius:9999px',
    'background:rgba(30,215,96,.16)',
    'color:#1ed760',
    'font-size:11px',
    'font-weight:700',
    'line-height:16px',
    'vertical-align:middle',
    'white-space:nowrap',
  ].join(';')
  const icon = document.createElement('img')
  icon.src = iconUrl
  icon.alt = ''
  icon.style.cssText = 'width:12px;height:12px;border-radius:9999px'
  badge.append(icon, request.requester_name ?? '신청곡')
  return badge
}

function isRequestSection(list: Element) {
  const section = list.parentElement
  if (!section?.querySelector('h2')) return false
  const hasHeaderButton = [...section.querySelectorAll('button')].some((button) => !list.contains(button))
  if (hasHeaderButton) return true
  const sections = [...(section.parentElement?.children ?? [])].filter((child) =>
    child.querySelector(sectionListSelector),
  )
  return sections[0] === section && list.getAttribute('aria-rowcount') === '1'
}

function render() {
  const unclaimed = [...requests]
  const wanted = new Map<Element, SongRequest>()
  const rows = [...document.querySelectorAll(sectionListSelector)]
    .filter(isRequestSection)
    .flatMap((list) => [...list.querySelectorAll<HTMLElement>(rowSelector)])
    .flatMap((element) => readRow(element) ?? [])
  for (const row of rows) {
    const index = unclaimed.findIndex((request) => matches(row, request))
    if (index === -1) continue
    wanted.set(row.subtitle, unclaimed[index])
    unclaimed.splice(index, 1)
  }

  for (const badge of document.querySelectorAll(`[${badgeAttribute}]`)) {
    const request = badge.parentElement && wanted.get(badge.parentElement)
    if (request && badge.getAttribute(badgeAttribute) === String(request.id)) wanted.delete(badge.parentElement!)
    else badge.remove()
  }
  for (const [subtitle, request] of wanted) subtitle.prepend(createBadge(request))

  const signature = rows.map((row) => row.trackUri ?? `${row.title}|${row.artists.join(',')}`).join('\n')
  if (signature !== lastQueueSignature) {
    lastQueueSignature = signature
    refreshSoon()
  }

  const status = `${rows.length} track rows, ${requests.length} pending requests, ${requests.length - unclaimed.length} marked`
  if (status !== lastStatus) {
    lastStatus = status
    console.debug(`[potibot] ${status}`)
  }
}

let renderQueued = false
function scheduleRender() {
  if (renderQueued || stopped) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    render()
  })
}

let refreshTimer: number | undefined
let lastRefreshAt = 0
function refreshSoon() {
  if (refreshTimer !== undefined) return
  const delay = Math.max(0, lastRefreshAt + queueChangeRefreshMs - Date.now())
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined
    void refreshRequests()
  }, delay)
}

async function refreshRequests() {
  if (stopped || document.visibilityState !== 'visible') return
  lastRefreshAt = Date.now()
  try {
    const message: ExtensionMessage = { type: 'get-pending-requests' }
    const response = (await chrome.runtime.sendMessage(message)) as PendingRequestsResponse | undefined
    requests = response?.requests ?? []
    scheduleRender()
  } catch {
    stop()
  }
}

const isBadge = (node: Node) => node instanceof Element && node.hasAttribute(badgeAttribute)

const isOwnMutation = (mutation: MutationRecord) => {
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes]
  return mutation.type === 'childList' && nodes.length > 0 && nodes.every(isBadge)
}

async function announceStatus() {
  const message: ExtensionMessage = { type: 'get-status' }
  let status: StatusResponse | undefined
  try {
    status = (await chrome.runtime.sendMessage(message)) as StatusResponse | undefined
  } catch {
    return
  }
  if (!status?.signedIn) {
    showToast({
      title: '포티봇 로그인이 필요합니다',
      detail: '확장 프로그램 아이콘을 눌러 치지직 계정으로 로그인해 주세요.',
      tone: 'warning',
      iconUrl,
    })
    return
  }
  const channel = status.channelName ?? '내 채널'
  const { spotify } = status
  if (!spotify.connected || spotify.reauth_required) {
    showToast({
      title: '포티봇 연결됨',
      detail: `${channel} · Spotify ${spotify.connected ? '인증이 만료되었습니다' : '연결이 필요합니다'}. 확장 프로그램 아이콘에서 연결해 주세요.`,
      tone: 'warning',
      iconUrl,
    })
    return
  }
  showToast({
    title: '포티봇 연결됨',
    detail: `${channel} · Spotify ${spotify.display_name ?? '계정'}`,
    tone: 'success',
    iconUrl,
  })
}

const observer = new MutationObserver((mutations) => {
  if (!mutations.every(isOwnMutation)) scheduleRender()
})

const poll = window.setInterval(() => void refreshRequests(), pollIntervalMs)
const onVisibilityChange = () => void refreshRequests()

const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
  if (area !== 'local' || !(tokenStorageKey in changes)) return
  void refreshRequests()
  void announceStatus()
}

function stop() {
  stopped = true
  observer.disconnect()
  window.clearInterval(poll)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.clearTimeout(refreshTimer)
  for (const badge of document.querySelectorAll(`[${badgeAttribute}]`)) badge.remove()
  try {
    chrome.storage.onChanged.removeListener(onStorageChanged)
  } catch {
    return
  }
}

observer.observe(document.body, { childList: true, subtree: true, characterData: true })
document.addEventListener('visibilitychange', onVisibilityChange)
chrome.storage.onChanged.addListener(onStorageChanged)
void refreshRequests()
void announceStatus()
