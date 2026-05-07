import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const api = axios.create({ baseURL: BASE_URL, withCredentials: true })

const ACCESS_KEY = 'chipin_access'
const REFRESH_KEY = 'chipin_refresh'

let _access: string | null = localStorage.getItem(ACCESS_KEY)
let _refresh: string | null = localStorage.getItem(REFRESH_KEY)

export function setTokens(access: string, refresh: string): void {
  _access = access
  _refresh = refresh
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  _access = null
  _refresh = null
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
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
        orig.headers = { ...orig.headers, Authorization: `Bearer ${_access}` }
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
