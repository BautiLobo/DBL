export function formatMoney(value) {
  const n = Number(value || 0)
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatInvoiceNumber(puntoVenta, invoiceNumber) {
  const pv = String(puntoVenta || '0001').replace(/\D/g, '').padStart(4, '0').slice(-4)
  const num = String(invoiceNumber || 0).padStart(8, '0')
  return `${pv}-${num}`
}
