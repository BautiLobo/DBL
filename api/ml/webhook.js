import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

const STATUS_MAP = {
  paid: 'paid',
  confirmed: 'paid',
  payment_required: 'pending',
  partially_paid: 'pending',
  cancelled: 'cancelled',
  invalid: 'cancelled',
}

async function handleOrder(resource) {
  const order = await mlFetch(resource)
  const db = supabaseAdmin()

  const { data: existing } = await db.from('sales').select('id').eq('ml_order_id', String(order.id)).maybeSingle()
  if (existing) return // ya procesado (ML puede reintentar notificaciones)

  let shipping_status = null
  let tracking_number = null
  const ml_shipment_id = order.shipping?.id ? String(order.shipping.id) : null
  if (ml_shipment_id) {
    try {
      const shipment = await mlFetch(`/shipments/${ml_shipment_id}`)
      shipping_status = shipment.status || null
      tracking_number = shipment.tracking_number || null
    } catch (e) {
      console.error('No se pudo traer el envío de la orden', order.id, e)
    }
  }

  const { data: sale, error } = await db
    .from('sales')
    .insert({
      source: 'mercadolibre',
      ml_order_id: String(order.id),
      status: STATUS_MAP[order.status] || 'pending',
      buyer_name: order.buyer?.nickname || '',
      total_amount: order.total_amount || 0,
      net_amount: order.total_amount || 0,
      sale_date: (order.date_created || new Date().toISOString()).slice(0, 10),
      ml_shipment_id,
      shipping_status,
      tracking_number,
      ml_buyer_id: order.buyer?.id ? String(order.buyer.id) : null,
    })
    .select()
    .single()

  if (error || !sale) {
    console.error('No se pudo guardar la venta ML', error)
    return
  }

  let cogs = 0
  for (const orderItem of order.order_items || []) {
    const mlItemId = orderItem.item?.id
    const { data: product } = await db.from('products').select('*').eq('ml_item_id', mlItemId).maybeSingle()
    if (!product) continue // producto todavía no vinculado a esta publicación

    await db.from('sale_items').insert({
      sale_id: sale.id,
      product_id: product.id,
      qty: orderItem.quantity,
      unit_price: orderItem.unit_price,
    })

    await db.from('products').update({ stock_qty: Math.max(0, product.stock_qty - orderItem.quantity) }).eq('id', product.id)
    await db.from('stock_movements').insert({
      product_id: product.id,
      type: 'out',
      qty: orderItem.quantity,
      reason: `Venta Mercado Libre #${order.id}`,
      related_sale_id: sale.id,
    })

    cogs += (Number(product.cost_price) || 0) * Number(orderItem.quantity)
  }

  await db.from('accounting_entries').insert([
    {
      type: 'income',
      category: 'ventas',
      amount: sale.total_amount,
      description: `Venta Mercado Libre #${order.id}`,
      related_sale_id: sale.id,
    },
    {
      type: 'expense',
      category: 'costo de mercadería',
      amount: cogs,
      description: `Costo de mercadería — venta #${sale.id}`,
      related_sale_id: sale.id,
    },
  ])
}

async function handleQuestion(resource) {
  const question = await mlFetch(resource)
  const db = supabaseAdmin()

  const { data: product } = await db.from('products').select('id').eq('ml_item_id', question.item_id).maybeSingle()
  if (!product) return

  const today = new Date().toISOString().slice(0, 10)
  const { data: row } = await db
    .from('ml_item_metrics')
    .select('*')
    .eq('product_id', product.id)
    .eq('metric_date', today)
    .maybeSingle()

  if (row) {
    await db.from('ml_item_metrics').update({ questions: row.questions + 1 }).eq('id', row.id)
  } else {
    await db.from('ml_item_metrics').insert({ product_id: product.id, metric_date: today, questions: 1 })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { topic, resource } = req.body || {}
  try {
    if (topic === 'orders_v2') await handleOrder(resource)
    else if (topic === 'questions') await handleQuestion(resource)
  } catch (e) {
    // Igual respondemos 200: si devolvemos error ML reintenta la misma notificación
    // en bucle. El detalle queda en los logs de Vercel para revisar a mano.
    console.error('Error procesando webhook ML', topic, resource, e)
  }

  res.status(200).json({ received: true })
}
