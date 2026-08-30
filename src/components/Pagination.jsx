export const PAGE_SIZE = 10

export default function Pagination({ page, totalPages, onPageChange, totalItems, pageSize = PAGE_SIZE }) {
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ color: 'var(--text-dim)' }}>{start}–{end} de {totalItems}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹ Anterior</button>
        <span style={{ color: 'var(--text-dim)' }}>Página {page} de {totalPages}</span>
        <button type="button" className="btn btn-ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente ›</button>
      </div>
    </div>
  )
}
