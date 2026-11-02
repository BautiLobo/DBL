// Fecha local (no UTC) en formato YYYY-MM-DD, para que "hoy" sea el día de Argentina.
export function localToday() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

// Sincroniza el stock de un producto con su publicación en Mercado Libre (si la tiene).
// No bloquea ni falla: si ML rechaza, el stock local ya quedó actualizado.
export function syncMlStock(product, newQty) {
  if (!product?.ml_item_id) return Promise.resolve()
  return fetch('/api/ml/listings?action=update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update', product_id: product.id, stock_qty: newQty }),
  }).catch(() => {})
}
