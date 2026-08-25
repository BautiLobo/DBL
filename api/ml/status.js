import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Le dice al frontend si hay una cuenta de ML conectada, sin exponer los tokens.
// Tambien identifica la cuenta (nickname, reputacion) para que quede claro qué usuario está publicando.
export default async function handler(req, res) {
  const db = supabaseAdmin()
  const { data: row } = await db
    .from('ml_credentials')
    .select('ml_user_id, expires_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return res.status(200).json({ connected: false })

  let whoami = null
  try {
    const me = await mlFetch('/users/me')
    whoami = {
      nickname: me.nickname,
      first_name: me.first_name,
      last_name: me.last_name,
      seller_reputation: me.seller_reputation
        ? { level_id: me.seller_reputation.level_id, power_seller_status: me.seller_reputation.power_seller_status }
        : null,
      permalink: me.permalink,
    }
  } catch (e) {
    console.error('Error consultando /users/me ML', e)
  }

  res.status(200).json({ connected: true, ...row, whoami })
}
