import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch, getValidAccessToken } from '../_lib/mlToken.js'

// Trae los mensajes post-venta de un pedido de Mercado Libre.
async function getMessages(req, res, db) {
  const saleId = req.query.sale_id
  if (!saleId) return res.status(400).json({ error: 'Falta sale_id' })

  const { data: sale } = await db.from('sales').select('ml_order_id, ml_buyer_id').eq('id', saleId).maybeSingle()
  if (!sale?.ml_order_id) return res.status(400).json({ error: 'Esta venta no tiene pedido de Mercado Libre asociado' })

  try {
    const data = await mlFetch(`/messages/orders/${sale.ml_order_id}?tag=post_sale&mark_as_read=false`)
    const messages = (data.messages || [])
      .map((m) => ({
        id: m.id,
        text: m.text,
        date: m.message_date?.created,
        from_buyer: String(m.from?.user_id) === String(sale.ml_buyer_id),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
    res.status(200).json({ messages })
  } catch (e) {
    console.error('Error trayendo mensajes ML', e)
    res.status(502).json({ error: 'No se pudieron traer los mensajes' })
  }
}

// Envía un mensaje post-venta a un comprador de Mercado Libre.
async function sendMessage(req, res, db) {
  const { sale_id, text } = req.body || {}
  if (!sale_id || !text?.trim()) return res.status(400).json({ error: 'Faltan sale_id o text' })

  const { data: sale } = await db.from('sales').select('ml_order_id, ml_buyer_id').eq('id', sale_id).maybeSingle()
  if (!sale?.ml_order_id || !sale?.ml_buyer_id) {
    return res.status(400).json({ error: 'Esta venta no tiene los datos de Mercado Libre necesarios' })
  }

  const { data: credentials } = await db
    .from('ml_credentials')
    .select('ml_user_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!credentials?.ml_user_id) return res.status(400).json({ error: 'No hay una cuenta de Mercado Libre conectada' })

  try {
    await mlFetch(`/messages/orders/${sale.ml_order_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { user_id: credentials.ml_user_id },
        to: { user_id: sale.ml_buyer_id },
        text: text.trim(),
      }),
    })
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Error enviando mensaje ML', e)
    res.status(502).json({ error: 'No se pudo enviar el mensaje', detail: e.message })
  }
}

// Refresca el estado de envío de una venta de Mercado Libre contra la API.
async function refreshShipping(req, res, db) {
  const { sale_id } = req.body || {}
  if (!sale_id) return res.status(400).json({ error: 'Falta sale_id' })

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

// Descarga la etiqueta de envío (PDF) de Mercado Envíos para imprimir en hoja A4.
async function shippingLabel(req, res, db) {
  const saleId = req.query.sale_id
  if (!saleId) return res.status(400).json({ error: 'Falta sale_id' })

  const { data: sale } = await db.from('sales').select('ml_shipment_id').eq('id', saleId).maybeSingle()
  if (!sale?.ml_shipment_id) return res.status(400).json({ error: 'Esta venta no tiene envío de Mercado Libre asociado' })

  try {
    const token = await getValidAccessToken()
    if (!token) return res.status(400).json({ error: 'No hay una cuenta de Mercado Libre conectada' })

    const mlRes = await fetch(
      `https://api.mercadolibre.com/shipment_labels?shipment_ids=${sale.ml_shipment_id}&response_type=pdf`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!mlRes.ok) {
      console.error('Error trayendo etiqueta ML', mlRes.status, await mlRes.text())
      return res.status(502).json({ error: 'No se pudo obtener la etiqueta de envío. Puede que todavía no esté lista.' })
    }

    const buffer = Buffer.from(await mlRes.arrayBuffer())
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="etiqueta-${sale.ml_shipment_id}.pdf"`)
    res.status(200).send(buffer)
  } catch (e) {
    console.error('Error trayendo etiqueta ML', e)
    res.status(502).json({ error: 'No se pudo obtener la etiqueta de envío' })
  }
}

export default async function handler(req, res) {
  const db = supabaseAdmin()
  const action = req.query.action || req.body?.action

  if (req.method === 'GET' && action === 'messages') return getMessages(req, res, db)
  if (req.method === 'POST' && action === 'send-message') return sendMessage(req, res, db)
  if (req.method === 'POST' && action === 'refresh-shipping') return refreshShipping(req, res, db)
  if (req.method === 'GET' && action === 'shipping-label') return shippingLabel(req, res, db)

  res.status(400).json({ error: 'Acción no reconocida' })
}
