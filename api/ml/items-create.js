import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Publica un producto del inventario como una publicación nueva en Mercado Libre.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { product_id, category_id, condition, listing_type_id } = req.body || {}
  if (!product_id || !category_id) {
    return res.status(400).json({ error: 'Faltan product_id o category_id' })
  }

  const db = supabaseAdmin()
  const { data: product } = await db.from('products').select('*').eq('id', product_id).maybeSingle()
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
  if (product.ml_item_id) return res.status(400).json({ error: 'Este producto ya está publicado en Mercado Libre' })

  const { data: photos } = await db
    .from('product_photos')
    .select('storage_path')
    .eq('product_id', product_id)
    .order('sort_order', { ascending: true })

  const pictures = (photos || []).map((p) => ({
    source: db.storage.from('product-photos').getPublicUrl(p.storage_path).data.publicUrl,
  }))

  const payload = {
    title: product.title.slice(0, 60),
    category_id,
    price: Number(product.sale_price) || 0,
    currency_id: 'ARS',
    available_quantity: Math.max(1, Number(product.stock_qty) || 1),
    buying_mode: 'buy_it_now',
    condition: condition === 'used' ? 'used' : 'new',
    listing_type_id: listing_type_id || 'gold_special',
    description: { plain_text: product.description || product.title },
    pictures,
  }

  try {
    const item = await mlFetch('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    await db
      .from('products')
      .update({ ml_item_id: item.id, ml_permalink: item.permalink, ml_status: item.status || 'active' })
      .eq('id', product_id)

    res.status(200).json({ ok: true, item_id: item.id, permalink: item.permalink, status: item.status })
  } catch (e) {
    console.error('Error creando publicación ML', e)
    res.status(502).json({ error: 'Mercado Libre rechazó la publicación', detail: e.message })
  }
}
