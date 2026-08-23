export function formatMoney(value) {
  const n = Number(value || 0)
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}
