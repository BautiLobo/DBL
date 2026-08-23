import { supabaseAdmin } from '../_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const db = supabaseAdmin()
  await db.from('ml_credentials').delete().neq('id', 0)
  res.status(200).json({ ok: true })
}
