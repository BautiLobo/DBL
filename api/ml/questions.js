import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { mlFetch } from '../_lib/mlToken.js'

// Trae las preguntas pre-venta sin responder de todas las publicaciones del vendedor.
async function listQuestions(req, res, db) {
  const { data: creds } = await db
    .from('ml_credentials')
    .select('ml_user_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!creds?.ml_user_id) return res.status(400).json({ error: 'No hay una cuenta de Mercado Libre conectada' })

  try {
    const data = await mlFetch(
      `/questions/search?seller_id=${creds.ml_user_id}&status=UNANSWERED&sort_fields=date_created&sort_types=DESC&limit=50`
    )
    const questions = data.questions || []

    const itemIds = [...new Set(questions.map((q) => q.item_id))]
    const { data: products } = itemIds.length
      ? await db.from('products').select('id, title, ml_item_id').in('ml_item_id', itemIds)
      : { data: [] }
    const byItem = {}
    for (const p of products || []) byItem[p.ml_item_id] = p

    res.status(200).json({
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text,
        date: q.date_created,
        item_id: q.item_id,
        product_id: byItem[q.item_id]?.id || null,
        product_title: byItem[q.item_id]?.title || null,
      })),
    })
  } catch (e) {
    console.error('Error trayendo preguntas ML', e)
    res.status(502).json({ error: 'No se pudieron traer las preguntas', detail: e.message })
  }
}

// Responde una pregunta pre-venta.
async function answerQuestion(req, res) {
  const { question_id, text } = req.body || {}
  if (!question_id || !text?.trim()) return res.status(400).json({ error: 'Faltan question_id o text' })

  try {
    await mlFetch('/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id, text: text.trim() }),
    })
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Error respondiendo pregunta ML', e)
    res.status(502).json({ error: 'No se pudo enviar la respuesta', detail: e.message })
  }
}

export default async function handler(req, res) {
  const db = supabaseAdmin()
  if (req.method === 'GET') return listQuestions(req, res, db)
  if (req.method === 'POST') return answerQuestion(req, res)
  res.status(405).end()
}
