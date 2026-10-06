import axios from 'axios'
import type { MouseEvent } from 'react'

type ApiConfig = {
  origin: string

  getToken?: () => Promise<string | null>

  openAuthPage?: (path: string) => void
}

const apiConfig: ApiConfig = { origin: '' }

export function configureApi(config: Partial<ApiConfig>) {
  Object.assign(apiConfig, config)
}

export const apiUrl = (path: string) => `${apiConfig.origin}/api${path}`

export const loginUrl = () => apiUrl('/chzzk/login')

export async function getAuthToken(): Promise<string | null> {
  return apiConfig.getToken ? apiConfig.getToken() : null
}

export function authLinkProps(path: string) {
  return {
    href: apiUrl(path),
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (!apiConfig.openAuthPage) return
      event.preventDefault()
      apiConfig.openAuthPage(path)
    },
  }
}

const client = axios.create({ withCredentials: true })

client.interceptors.request.use(async (config) => {
  config.baseURL = apiUrl('')
  const token = await getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(undefined, (error) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    window.location.pathname.startsWith('/dashboard')
  ) {
    window.location.href = loginUrl()
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status

    const log = status !== undefined && status < 500 ? console.warn : console.error
    log('[api] request failed', {
      method: error.config?.method,
      url: error.config?.url,
      status,
      data: error.response?.data,
    })
  }
  return Promise.reject(error)
})

export async function get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  return (await client.get<T>(endpoint, { params })).data
}

export async function post<T>(endpoint: string, body?: unknown): Promise<T> {
  return (await client.post<T>(endpoint, body)).data
}

export async function patch<T>(endpoint: string, body?: unknown): Promise<T> {
  return (await client.patch<T>(endpoint, body)).data
}

export async function del<T>(endpoint: string): Promise<T> {
  return (await client.delete<T>(endpoint)).data
}

export async function put<T>(endpoint: string, body?: unknown): Promise<T> {
  return (await client.put<T>(endpoint, body)).data
}
