import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Pensado para correr por Vercel Cron (ver vercel.json). Trae las visitas del
// día de cada publicación vinculada y las guarda como snapshot diario.
export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization']
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end()
  }

  const db = supabaseAdmin()
  const { data: products } = await db
    .from('products')
    .select('id, ml_item_id')
    .eq('active', true)
    .not('ml_item_id', 'is', null)

  const today = new Date().toISOString().slice(0, 10)
  const results = []

  for (const product of products || []) {
    try {
      const data = await mlFetch(`/items/${product.ml_item_id}/visits/time_window?last=1&unit=day`)
      const visits = (data.results || []).reduce((s, r) => s + (r.total || 0), 0)

      const { data: existing } = await db
        .from('ml_item_metrics')
        .select('id')
        .eq('product_id', product.id)
        .eq('metric_date', today)
        .maybeSingle()

      if (existing) {
        await db.from('ml_item_metrics').update({ visits }).eq('id', existing.id)
      } else {
        await db.from('ml_item_metrics').insert({ product_id: product.id, metric_date: today, visits })
      }
      results.push({ product_id: product.id, visits, ok: true })
    } catch (e) {
      console.error('Error sincronizando métricas de', product.ml_item_id, e)
      results.push({ product_id: product.id, ok: false })
    }
  }

  res.status(200).json({ synced: results.length, results })
}
