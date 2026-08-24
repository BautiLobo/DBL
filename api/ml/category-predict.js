import { mlFetch } from '../_lib/mlToken.js'

// Sugiere categorías de Mercado Libre a partir de un texto (título del producto).
export default async function handler(req, res) {
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
