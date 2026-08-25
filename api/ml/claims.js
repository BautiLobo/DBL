import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Trae los reclamos/mediaciones abiertos donde el vendedor es el respondiente.
// La resolución en sí (subir evidencia, aceptar devolución, etc.) se hace en Mercado Libre:
// acá solo listamos para que no se pase nada por alto, con link directo a cada uno.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const db = supabaseAdmin()
  const { data: creds } = await db
    .from('ml_credentials')
    .select('ml_user_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!creds?.ml_user_id) return res.status(400).json({ error: 'No hay una cuenta de Mercado Libre conectada' })

  try {
    // El token ya scopea los resultados a la cuenta conectada; el filtro status=opened
    // es obligatorio (la API exige al menos un filtro) y trae los reclamos que faltan resolver.
    const data = await mlFetch(`/post-purchase/v1/claims/search?status=opened`)
    const claims = (data.data || []).map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      stage: c.stage,
      reason: c.reason_id || c.reason || null,
      resource_id: c.resource_id,
      date: c.date_created,
    }))
    res.status(200).json({ claims })
  } catch (e) {
    console.error('Error trayendo reclamos ML', e)
    res.status(502).json({ error: 'No se pudieron traer los reclamos', detail: e.message })
  }
}
