import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Refresca el estado de envío de una venta de Mercado Libre contra la API.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { sale_id } = req.body || {}
  if (!sale_id) return res.status(400).json({ error: 'Falta sale_id' })

  const db = supabaseAdmin()
  const { data: sale } = await db.from('sales').select('ml_shipment_id').eq('id', sale_id).maybeSingle()
  if (!sale?.ml_shipment_id) return res.status(400).json({ error: 'Esta venta no tiene envío de Mercado Libre asociado' })

  try {
    const shipment = await mlFetch(`/shipments/${sale.ml_shipment_id}`)
    const shipping_status = shipment.status || null
    const tracking_number = shipment.tracking_number || null

    await db.from('sales').update({ shipping_status, tracking_number }).eq('id', sale_id)

    res.status(200).json({ ok: true, shipping_status, tracking_number })
  } catch (e) {
    console.error('Error consultando envío ML', e)
    res.status(502).json({ error: 'No se pudo consultar el envío' })
  }
}
