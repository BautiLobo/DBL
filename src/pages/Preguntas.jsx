import { useEffect, useState } from 'react'
import { formatDate } from '../lib/format'

export default function Preguntas() {
  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})
  const [sendingId, setSendingId] = useState(null)

  async function load() {
    setError('')
    try {
      const res = await fetch('/api/ml/questions')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error trayendo preguntas')
      setQuestions(data.questions || [])
    } catch (e) {
      setError(e.message)
      setQuestions([])
    }
  }

  useEffect(() => { load() }, [])

  async function answer(question) {
    const text = (drafts[question.id] || '').trim()
    if (!text) return
    setSendingId(question.id)
    setError('')
    try {
      const res = await fetch('/api/ml/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id, text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error enviando la respuesta')
      setQuestions((prev) => prev.filter((q) => q.id !== question.id))
    } catch (e) {
      setError(e.message)
    }
    setSendingId(null)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Preguntas</h1>
          <p>Preguntas pre-venta de Mercado Libre sin responder</p>
        </div>
        <button className="btn" onClick={load}>↻ Actualizar</button>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        {questions === null ? (
          <div className="empty-state">Cargando…</div>
        ) : questions.length === 0 ? (
          <div className="empty-state">No tenés preguntas pendientes. 👍</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {questions.map((q) => (
              <div key={q.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <div style={{ fontWeight: 600 }}>{q.product_title || `Publicación ${q.item_id}`}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{formatDate(q.date)}</div>
                </div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>{q.text}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    placeholder="Escribir respuesta…"
                    value={drafts[q.id] || ''}
                    onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && answer(q)}
                  />
                  <button className="btn btn-primary" disabled={sendingId === q.id} onClick={() => answer(q)}>
                    {sendingId === q.id ? 'Enviando…' : 'Responder'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
