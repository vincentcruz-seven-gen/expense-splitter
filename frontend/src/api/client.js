export const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

async function request(method, path, body) {
  const token = localStorage.getItem('access_token')
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('access_token')
    window.location.href = '/login'
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  login: (username, password) => {
    const form = new URLSearchParams({ username, password })
    return fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.detail ?? 'Login failed')
      }
      return r.json()
    })
  },

  uploadReceipt: (file) => {
    const token = localStorage.getItem('access_token')
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/receipts/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json())
  },
}
