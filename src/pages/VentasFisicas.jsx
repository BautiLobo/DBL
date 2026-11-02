import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import { localToday, syncMlStock } from '../lib/stock'
import Pagination, { PAGE_SIZE } from '../components/Pagination'
import BarcodeScanner from '../components/BarcodeScanner'
import AssignBarcode from '../components/AssignBarcode'

const PHYSICAL_NOTE = 'Venta física'

export default function VentasFisicas() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [qtys, setQtys] = useState({}) // { [productId]: cantidad vendida }
  const [prices, setPrices] = useState({}) // { [productId]: precio unitario si se cambió }
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [todaySales, setTodaySales] = useState([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [assignCode, setAssignCode] = useState(null)

  async function loadData() {
    setLoading(true)
    const { data: prods } = await supabase
      .from('products')
      .select('id, title, sku, barcode, category, sale_price, cost_price, stock_qty, ml_item_id')
      .eq('active', true)
      .order('title')
    setProducts(prods || [])

    const { data: sales } = await supabase
      .from('sales')
      .select('id, total_amount, created_at, sale_items(qty, unit_price, products(title))')
      .eq('source', 'manual')
      .eq('notes', PHYSICAL_NOTE)
      .eq('sale_date', localToday())
      .order('created_at', { ascending: false })
    setTodaySales(sales || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  function bump(p, delta) {
    setMessage('')
    setQtys((prev) => {
      const next = Math.min(p.stock_qty, Math.max(0, (prev[p.id] || 0) + delta))
      if (next === 0) {
        const { [p.id]: _omit, ...rest } = prev
        return rest
      }
      return { ...prev, [p.id]: next }
    })
  }

  function setQty(p, value) {
    setMessage('')
    const n = Math.min(p.stock_qty, Math.max(0, Math.floor(Number(value) || 0)))
    setQtys((prev) => {
      if (n === 0) {
        const { [p.id]: _omit, ...rest } = prev
        return rest
      }
      return { ...prev, [p.id]: n }
    })
  }

  function addScanned(p) {
    const current = qtys[p.id] || 0
    if (current >= p.stock_qty) return { text: `✗ ${p.title}: no hay más stock (${p.stock_qty})`, ok: false }
    bump(p, 1)
    return { text: `✓ ${p.title} — ${current + 1} vendido(s)`, ok: true }
  }

  function handleScan(code) {
    const p = products.find((x) => x.barcode === code) || products.find((x) => x.sku && x.sku === code)
    if (p) return addScanned(p)
    setScannerOpen(false)
    setAssignCode(code)
    return null
  }

  function handleAssigned(p) {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, barcode: p.barcode } : x)))
    setAssignCode(null)
    if (p.stock_qty > 0) bump(p, 1)
    setScannerOpen(true)
  }

  function unitPrice(p) {
    return prices[p.id] !== undefined ? Number(prices[p.id]) || 0 : Number(p.sale_price) || 0
  }

  const selected = products.filter((p) => qtys[p.id] > 0)
  const totalUnits = selected.reduce((s, p) => s + qtys[p.id], 0)
  const total = selected.reduce((s, p) => s + qtys[p.id] * unitPrice(p), 0)

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return !q || p.title.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.category || '').toLowerCase().includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const todayTotal = useMemo(() => todaySales.reduce((s, x) => s + Number(x.total_amount), 0), [todaySales])
  const todayUnits = useMemo(
    () => todaySales.reduce((s, x) => s + (x.sale_items || []).reduce((a, it) => a + it.qty, 0), 0),
    [todaySales]
  )

  async function registerSale() {
    if (selected.length === 0) return
    if (!confirm(`¿Registrar venta de ${totalUnits} unidad(es) por ${formatMoney(total)}? Se descuenta del inventario.`)) return
    setSaving(true)
    setMessage('')

    // Releer stock actual para no pisar cambios hechos desde otro lado (ej. una venta de ML)
    const ids = selected.map((p) => p.id)
    const { data: fresh } = await supabase.from('products').select('id, stock_qty, cost_price, ml_item_id, title').in('id', ids)
    const freshById = Object.fromEntries((fresh || []).map((p) => [p.id, p]))

    const short = selected.filter((p) => (freshById[p.id]?.stock_qty ?? 0) < qtys[p.id])
    if (short.length > 0) {
      setSaving(false)
      setMessage('No alcanza el stock de: ' + short.map((p) => p.title).join(', ') + '. Se actualizó la lista.')
      loadData()
      return
    }

    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        source: 'manual',
        status: 'delivered',
        buyer_name: 'Venta en local',
        total_amount: total,
        net_amount: total,
        sale_date: localToday(),
        notes: PHYSICAL_NOTE,
      })
      .select()
      .single()

    if (error || !sale) {
      setSaving(false)
      setMessage('No se pudo registrar la venta: ' + (error?.message || 'error desconocido'))
      return
    }

    await supabase.from('sale_items').insert(
      selected.map((p) => ({ sale_id: sale.id, product_id: p.id, qty: qtys[p.id], unit_price: unitPrice(p) }))
    )

    let cogs = 0
    await Promise.all(selected.map(async (p) => {
      const f = freshById[p.id]
      const qty = qtys[p.id]
      const newQty = Math.max(0, f.stock_qty - qty)
      await supabase.from('products').update({ stock_qty: newQty }).eq('id', p.id)
      await supabase.from('stock_movements').insert({
        product_id: p.id,
        type: 'out',
        qty,
        reason: PHYSICAL_NOTE,
        related_sale_id: sale.id,
      })
      cogs += (Number(f.cost_price) || 0) * qty
      await syncMlStock(f, newQty)
    }))

    const entries = [{
      type: 'income',
      category: 'ventas',
      amount: total,
      description: `${PHYSICAL_NOTE} — ${totalUnits} unidad(es)`,
      related_sale_id: sale.id,
      entry_date: localToday(),
    }]
    if (cogs > 0) {
      entries.push({
        type: 'expense',
        category: 'costo de mercadería',
        amount: cogs,
        description: `Costo de mercadería — venta #${sale.id}`,
        related_sale_id: sale.id,
        entry_date: localToday(),
      })
    }
    await supabase.from('accounting_entries').insert(entries)

    setQtys({})
    setPrices({})
    setSaving(false)
    setMessage(`✓ Venta #${sale.id} registrada por ${formatMoney(total)}. Inventario actualizado.`)
    loadData()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ventas del día</h1>
          <p>Ventas en el local — marcá cuántas unidades vendiste y se descuentan del inventario</p>
        </div>
        <button className="btn btn-primary" onClick={() => setScannerOpen(true)}>📷 Escanear</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Vendido hoy</div>
          <div className="stat-value green">{formatMoney(todayTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unidades hoy</div>
          <div className="stat-value accent">{todayUnits}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ventas registradas hoy</div>
          <div className="stat-value">{todaySales.length}</div>
        </div>
      </div>

      {(selected.length > 0 || message) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          {selected.length > 0 ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {totalUnits} unidad(es) · Total {formatMoney(total)}
              </span>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { setQtys({}); setPrices({}) }}>Limpiar</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={registerSale}>
                  {saving ? 'Registrando…' : 'Registrar venta'}
                </button>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600 }}>{message}</span>
          )}
        </div>
      )}
      {selected.length > 0 && message && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>{message}</div>}

      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Buscar por título, SKU o categoría…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay productos.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Precio unit.</th>
                <th>Vendidos</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const q = qtys[p.id] || 0
                return (
                  <tr key={p.id} style={q > 0 ? { background: 'var(--accent-soft)' } : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.title}</div>
                      {p.sku && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.sku}</div>}
                    </td>
                    <td>
                      {p.stock_qty === 0
                        ? <span className="badge badge-danger">Sin stock</span>
                        : <span>{p.stock_qty - q}{q > 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}> (de {p.stock_qty})</span>}</span>}
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        style={{ maxWidth: 110 }}
                        value={prices[p.id] !== undefined ? prices[p.id] : (p.sale_price ?? 0)}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" className="btn" disabled={q === 0} onClick={() => bump(p, -1)}>−</button>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max={p.stock_qty}
                          style={{ width: 60, textAlign: 'center' }}
                          value={q}
                          onChange={(e) => setQty(p, e.target.value)}
                        />
                        <button type="button" className="btn" disabled={q >= p.stock_qty} onClick={() => bump(p, 1)}>+</button>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{q > 0 ? formatMoney(q * unitPrice(p)) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} />

      {scannerOpen && (
        <BarcodeScanner title="Escanear productos vendidos" onDetect={handleScan} onClose={() => setScannerOpen(false)} />
      )}
      {assignCode && (
        <AssignBarcode code={assignCode} products={products} onAssigned={handleAssigned} onClose={() => setAssignCode(null)} />
      )}

      {todaySales.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, margin: '24px 0 10px' }}>Ventas registradas hoy</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Hora</th><th>Venta</th><th>Productos</th><th>Total</th></tr>
              </thead>
              <tbody>
                {todaySales.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>#{s.id}</td>
                    <td style={{ fontSize: 13 }}>
                      {(s.sale_items || []).map((it) => `${it.products?.title || 'producto'} x${it.qty}`).join(', ')}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(s.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
