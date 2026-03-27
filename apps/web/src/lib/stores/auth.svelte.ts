import type { User, Org } from '$lib/api.js'

interface AuthState {
  token: string | null
  user: User | null
  org: Org | null
}

export const auth = $state<AuthState>({ token: null, user: null, org: null })

export function setAuth(token: string, user: User, org: Org) {
  auth.token = token
  auth.user = user
  auth.org = org
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aarfang_token', token)
  }
}

export function clearAuth() {
  auth.token = null
  auth.user = null
  auth.org = null
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('aarfang_token')
  }
}

export function loadStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem('aarfang_token')
}
