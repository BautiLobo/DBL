import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

const ALLOWED_STATUS = ['active', 'paused', 'closed']
const ROOT_CATEGORY_ID = 'MLA1771' // Repuestos Motos y Cuatriciclos

// Sugiere categorías de Mercado Libre a partir de un texto (título del producto).
async function categorySearch(req, res) {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Falta el parámetro q' })

  try {
    const data = await mlFetch(`/sites/MLA/domain_discovery/search?q=${encodeURIComponent(q)}&limit=5`)
    const suggestions = (Array.isArray(data) ? data : []).map((d) => ({
      category_id: d.category_id,
      category_name: d.category_name,
      domain_id: d.domain_id,
      domain_name: d.domain_name,
    }))
    res.status(200).json({ suggestions })
  } catch (e) {
    console.error('Error prediciendo categoría ML', e)
    res.status(502).json({ error: 'No se pudo consultar categorías en Mercado Libre' })
  }
}

// Navega el árbol de categorías de Mercado Libre por ID. El buscador por texto
// (domain_discovery/search) está bloqueado por el PolicyAgent de ML para esta cuenta/IP,
// pero la lectura directa de una categoría por ID sí funciona, así que armamos un
// navegador (categoría → subcategorías) en vez de depender de la búsqueda.
async function categoryChildren(req, res) {
  const id = req.query.id || ROOT_CATEGORY_ID
  try {
    const data = await mlFetch(`/categories/${id}`)
    res.status(200).json({
      id: data.id,
      name: data.name,
      listing_allowed: data.settings?.listing_allowed || false,
      children: (data.children_categories || []).map((c) => ({ id: c.id, name: c.name })),
    })
  } catch (e) {
    console.error('Error navegando categorías ML', e)
    res.status(502).json({ error: 'No se pudo consultar la categoría en Mercado Libre' })
  }
}

// Trae los atributos obligatorios de una categoría (ej: Marca, Número de pieza).
async function categoryAttributes(req, res) {
  const id = req.query.id
  if (!id) return res.status(400).json({ error: 'Falta id' })
  try {
    const data = await mlFetch(`/categories/${id}/attributes`)
    const required = (Array.isArray(data) ? data : []).filter((a) => a.tags?.required)
    res.status(200).json({
      attributes: required.map((a) => ({ id: a.id, name: a.name, values: (a.values || []).map((v) => v.name) })),
    })
  } catch (e) {
    console.error('Error trayendo atributos de categoría ML', e)
    res.status(502).json({ error: 'No se pudieron traer los atributos de la categoría' })
  }
}

// Trae las reseñas de una publicación de Mercado Libre.
async function reviews(req, res) {
  const itemId = req.query.item_id
  if (!itemId) return res.status(400).json({ error: 'Falta item_id' })

  try {
    const data = await mlFetch(`/reviews/item/${itemId}`)
    res.status(200).json({
      rating_average: data.rating_average || 0,
      reviews_total: data.paging?.total || 0,
      reviews: (data.reviews || []).map((r) => ({
        id: r.id,
        rate: r.rate,
        comment: r.comment,
        date: r.date_created,
      })),
    })
  } catch (e) {
    console.error('Error trayendo reseñas ML', e)
    res.status(502).json({ error: 'No se pudieron traer las reseñas' })
  }
}

// Publica un producto del inventario como una publicación nueva en Mercado Libre.
// Si el producto tiene variantes cargadas (product_variants), publica con variations;
// si no, publica como item simple con precio/stock propios.
async function create(req, res, db) {
  const { product_id, category_id, condition, listing_type_id, attributes, picture_urls } = req.body || {}
  if (!product_id || !category_id) {
    return res.status(400).json({ error: 'Faltan product_id o category_id' })
  }

  const { data: product } = await db.from('products').select('*').eq('id', product_id).maybeSingle()
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
  if (product.ml_item_id) return res.status(400).json({ error: 'Este producto ya está publicado en Mercado Libre' })

  const { data: photos } = await db
    .from('product_photos')
    .select('storage_path')
    .eq('product_id', product_id)
    .order('sort_order', { ascending: true })

  let pictures = (photos || []).map((p) => ({
    source: db.storage.from('product-photos').getPublicUrl(p.storage_path).data.publicUrl,
  }))

  // Fallback para publicar aunque el producto todavía no tenga fotos subidas en el inventario.
  if (pictures.length === 0 && Array.isArray(picture_urls) && picture_urls.length > 0) {
    pictures = picture_urls.map((url) => ({ source: url }))
  }

  const { data: variants } = await db.from('product_variants').select('*').eq('product_id', product_id).order('id')

  const descriptionParts = [product.description]
  if (product.brand_compat) descriptionParts.push(`Compatible con: ${product.brand_compat}`)
  const descriptionText = descriptionParts.filter(Boolean).join('\n\n') || product.title

  const payload = {
    title: product.title.slice(0, 60),
    category_id,
    currency_id: 'ARS',
    buying_mode: 'buy_it_now',
    condition: condition === 'used' ? 'used' : 'new',
    listing_type_id: listing_type_id || 'gold_special',
    description: { plain_text: descriptionText },
    pictures,
  }

  if (Array.isArray(attributes) && attributes.length > 0) {
    payload.attributes = attributes
  }

  if (variants && variants.length > 0) {
    payload.price = Number(product.sale_price) || 0
    payload.variations = variants.map((v) => ({
      attribute_combinations: Object.entries(v.attributes || {}).map(([name, value_name]) => ({ name, value_name })),
      available_quantity: Math.max(1, Number(v.stock_qty) || 1),
    }))
  } else {
    payload.price = Number(product.sale_price) || 0
    payload.available_quantity = Math.max(1, Number(product.stock_qty) || 1)
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

    if (item.variations?.length && variants?.length) {
      for (let i = 0; i < item.variations.length && i < variants.length; i++) {
        await db.from('product_variants').update({ ml_variation_id: String(item.variations[i].id) }).eq('id', variants[i].id)
      }
    }

    res.status(200).json({ ok: true, item_id: item.id, permalink: item.permalink, status: item.status })
  } catch (e) {
    console.error('Error creando publicación ML', e)
    res.status(502).json({ error: 'Mercado Libre rechazó la publicación', detail: e.message })
  }
}

// Actualiza precio, stock, estado de una publicación, o el stock de una variante puntual.
async function update(req, res, db) {
  const { product_id, price, stock_qty, status, variant_id, variant_stock_qty } = req.body || {}
  if (!product_id) return res.status(400).json({ error: 'Falta product_id' })
  if (status && !ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }

  const { data: product } = await db.from('products').select('ml_item_id').eq('id', product_id).maybeSingle()
  if (!product?.ml_item_id) return res.status(400).json({ error: 'El producto no está publicado en Mercado Libre' })

  if (variant_id) {
    const { data: variant } = await db.from('product_variants').select('ml_variation_id').eq('id', variant_id).maybeSingle()
    if (!variant?.ml_variation_id) return res.status(400).json({ error: 'Esta variante todavía no está publicada en Mercado Libre' })
    try {
      await mlFetch(`/items/${product.ml_item_id}/variations/${variant.ml_variation_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_quantity: Math.max(0, Number(variant_stock_qty) || 0) }),
      })
      return res.status(200).json({ ok: true })
    } catch (e) {
      console.error('Error actualizando variante ML', e)
      return res.status(502).json({ error: 'No se pudo actualizar la variante', detail: e.message })
    }
  }

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

    if (status) await db.from('products').update({ ml_status: status }).eq('id', product_id)

    res.status(200).json({ ok: true, status: item.status })
  } catch (e) {
    console.error('Error actualizando publicación ML', e)
    res.status(502).json({ error: 'Mercado Libre rechazó la actualización', detail: e.message })
  }
}

export default async function handler(req, res) {
  const db = supabaseAdmin()
  const action = req.query.action || req.body?.action

  if (req.method === 'GET' && action === 'category-search') return categorySearch(req, res)
  if (req.method === 'GET' && action === 'category-children') return categoryChildren(req, res)
  if (req.method === 'GET' && action === 'category-attributes') return categoryAttributes(req, res)
  if (req.method === 'GET' && action === 'reviews') return reviews(req, res)
  if (req.method === 'POST' && action === 'create') return create(req, res, db)
  if (req.method === 'POST' && action === 'update') return update(req, res, db)

  res.status(400).json({ error: 'Acción no reconocida' })
}
