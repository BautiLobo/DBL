import { useEffect, useState } from 'react'
import { formatDate } from '../lib/format'
import Pagination, { PAGE_SIZE } from '../components/Pagination'

const STATUS_LABEL = { opened: 'Abierto', in_mediation: 'En mediación', closed: 'Cerrado', cancelled: 'Cancelado' }
const STATUS_BADGE = { opened: 'badge-warning', in_mediation: 'badge-danger', closed: 'badge-neutral', cancelled: 'badge-neutral' }

export default function Reclamos() {
  const [claims, setClaims] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  async function load() {
    setError('')
    try {
      const res = await fetch('/api/ml/claims')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error + (data.detail ? ': ' + data.detail : ''))
      setClaims(data.claims || [])
    } catch (e) {
      setError(e.message)
      setClaims([])
    }
  }

  useEffect(() => { load() }, [])

  const totalPages = Math.max(1, Math.ceil((claims?.length || 0) / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = (claims || []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reclamos</h1>
          <p>Reclamos y mediaciones abiertos en Mercado Libre</p>
        </div>
        <button className="btn" onClick={load}>↻ Actualizar</button>
      </div>

      {error && (
        <div className="auth-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
        Acá solo se listan para que no se te pase ninguno. Subir evidencia, aceptar una devolución o responder
        una mediación se hace directamente en Mercado Libre.
      </p>

      <div className="table-wrap">
        {claims === null ? (
          <div className="empty-state">Cargando…</div>
        ) : claims.length === 0 ? (
          <div className="empty-state">No tenés reclamos abiertos. 👍</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Pedido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.date)}</td>
                  <td>{c.type || '—'}</td>
                  <td>
                    <span className={'badge ' + (STATUS_BADGE[c.status] || 'badge-neutral')}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                  </td>
                  <td>{c.resource_id || '—'}</td>
                  <td>
                    <a
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      href={`https://www.mercadolibre.com.ar/ayuda/reclamos/${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver en ML ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={claims?.length || 0} />
    </div>
  )
}
