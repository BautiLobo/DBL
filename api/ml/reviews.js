import { mlFetch } from '../_lib/mlToken.js'

// Trae las reseñas de una publicación de Mercado Libre.
export default async function handler(req, res) {
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
