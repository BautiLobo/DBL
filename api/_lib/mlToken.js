import { supabaseAdmin } from './supabaseAdmin.js'

const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'

// Devuelve un access_token válido, refrescándolo contra la API de ML si ya venció.
export async function getValidAccessToken() {
  const db = supabaseAdmin()
  const { data: row } = await db
    .from('ml_credentials')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return null

  const expiresAt = new Date(row.expires_at).getTime()
  const stillValid = expiresAt - Date.now() > 5 * 60 * 1000 // 5 min de margen

  if (stillValid) return row.access_token

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: row.refresh_token,
    }),
  })

  if (!res.ok) {
    console.error('Error refrescando token ML', await res.text())
    return null
  }

  const json = await res.json()
  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString()

  await db
    .from('ml_credentials')
    .update({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  return json.access_token
}

export async function mlFetch(path, options = {}) {
  const token = await getValidAccessToken()
  if (!token) throw new Error('No hay una cuenta de Mercado Libre conectada')

  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`ML API ${path} respondió ${res.status}: ${await res.text()}`)
  }
  return res.json()
}
