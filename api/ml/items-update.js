import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

const ALLOWED_STATUS = ['active', 'paused', 'closed']

// Actualiza precio, stock y/o estado de una publicación existente en Mercado Libre.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { product_id, price, stock_qty, status } = req.body || {}
  if (!product_id) return res.status(400).json({ error: 'Falta product_id' })
  if (status && !ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }

  const db = supabaseAdmin()
  const { data: product } = await db.from('products').select('ml_item_id').eq('id', product_id).maybeSingle()
  if (!product?.ml_item_id) return res.status(400).json({ error: 'El producto no está publicado en Mercado Libre' })

  const patch = {}
  if (price !== undefined) patch.price = Number(price)
  if (stock_qty !== undefined) patch.available_quantity = Math.max(0, Number(stock_qty))
  if (status) patch.status = status

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para actualizar' })

  try {
    const item = await mlFetch(`/items/${product.ml_item_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })

    if (status) {
      await db.from('products').update({ ml_status: status }).eq('id', product_id)
    }

    res.status(200).json({ ok: true, status: item.status })
  } catch (e) {
    console.error('Error actualizando publicación ML', e)
    res.status(502).json({ error: 'Mercado Libre rechazó la actualización', detail: e.message })
  }
}
