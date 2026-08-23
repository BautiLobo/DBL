import { supabaseAdmin } from '../_lib/supabaseAdmin.js'

// Le dice al frontend si hay una cuenta de ML conectada, sin exponer los tokens.
export default async function handler(req, res) {
  const db = supabaseAdmin()
  const { data: row } = await db
    .from('ml_credentials')
    .select('ml_user_id, expires_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  res.status(200).json({ connected: Boolean(row), ...row })
}
