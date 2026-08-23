import { supabaseAdmin } from '../_lib/supabaseAdmin.js'

// Mercado Libre redirige acá con ?code=... luego de que el usuario autoriza la app.
export default async function handler(req, res) {
  const { code, error } = req.query

  if (error || !code) {
    res.writeHead(302, { Location: '/configuracion?ml_error=1' })
    return res.end()
  }

  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) throw new Error(await tokenRes.text())
    const json = await tokenRes.json()

    const db = supabaseAdmin()
    await db.from('ml_credentials').delete().neq('id', 0) // solo una cuenta conectada a la vez
    await db.from('ml_credentials').insert({
      ml_user_id: String(json.user_id),
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    })

    res.writeHead(302, { Location: '/configuracion?ml_connected=1' })
    res.end()
  } catch (e) {
    console.error('Error en callback ML', e)
    res.writeHead(302, { Location: '/configuracion?ml_error=1' })
    res.end()
  }
}
