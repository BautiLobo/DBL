import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Trae y envía mensajes post-venta de un pedido de Mercado Libre.
export default async function handler(req, res) {
  const db = supabaseAdmin()

  if (req.method === 'GET') {
    const saleId = req.query.sale_id
    if (!saleId) return res.status(400).json({ error: 'Falta sale_id' })

    const { data: sale } = await db.from('sales').select('ml_order_id, ml_buyer_id').eq('id', saleId).maybeSingle()
    if (!sale?.ml_order_id) return res.status(400).json({ error: 'Esta venta no tiene pedido de Mercado Libre asociado' })

    try {
      const data = await mlFetch(`/messages/orders/${sale.ml_order_id}?tag=post_sale&mark_as_read=false`)
      const messages = (data.messages || []).map((m) => ({
        id: m.id,
        text: m.text,
        date: m.message_date?.created,
        from_buyer: String(m.from?.user_id) === String(sale.ml_buyer_id),
      })).sort((a, b) => new Date(a.date) - new Date(b.date))
      res.status(200).json({ messages })
    } catch (e) {
      console.error('Error trayendo mensajes ML', e)
      res.status(502).json({ error: 'No se pudieron traer los mensajes' })
    }
    return
  }

  if (req.method === 'POST') {
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
    return
  }

  res.status(405).end()
}
