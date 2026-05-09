import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const api = axios.create({ baseURL: BASE_URL, withCredentials: true })

const ACCESS_KEY = 'chipin_access'
const REFRESH_KEY = 'chipin_refresh'

// localStorage can throw in private-browsing mode on iOS/Android and in some
// sandboxed WebViews. All reads and writes are wrapped so a storage failure
// never causes a blank screen — the user just ends up unauthenticated.
function storageSafeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSafeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch { /* ignore */ }
}

function storageSafeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch { /* ignore */ }
}

let _access: string | null = storageSafeGet(ACCESS_KEY)
let _refresh: string | null = storageSafeGet(REFRESH_KEY)

export function setTokens(access: string, refresh: string): void {
  _access = access
  _refresh = refresh
  storageSafeSet(ACCESS_KEY, access)
  storageSafeSet(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  _access = null
  _refresh = null
  storageSafeRemove(ACCESS_KEY)
  storageSafeRemove(REFRESH_KEY)
}

export function hasTokens(): boolean {
  return _access !== null
}

api.interceptors.request.use((config) => {
  if (_access) config.headers.Authorization = `Bearer ${_access}`
  return config
})

let _refreshing: Promise<void> | null = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig: AxiosRequestConfig & { _retry?: boolean } = err.config ?? {}
    if (err.response?.status === 401 && !orig._retry && _refresh) {
      orig._retry = true
      if (!_refreshing) {
        _refreshing = api
          .post('/auth/refresh', { refresh_token: _refresh })
          .then(({ data }) => setTokens(data.access_token, data.refresh_token))
          .catch(() => {
            clearTokens()
            window.location.replace('/login')
          })
          .finally(() => { _refreshing = null })
      }
      await _refreshing
      if (_access) {
        orig.headers = { ...(orig.headers as Record<string, unknown>), Authorization: `Bearer ${_access}` }
        return api(orig)
      }
    }
    if (err.response?.status === 401 && !orig._retry) {
      clearTokens()
      window.location.replace('/login')
    }
    return Promise.reject(err)
  },
)
