import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import { localToday, syncMlStock } from '../lib/stock'
import Pagination, { PAGE_SIZE } from '../components/Pagination'
import BarcodeScanner from '../components/BarcodeScanner'
import AssignBarcode from '../components/AssignBarcode'

export default function CargaCompra() {
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyLoaded, setOnlyLoaded] = useState(false)
  const [page, setPage] = useState(1)
  // { [productId]: { qty, unit_cost, sale_price } } — solo los productos tocados
  const [lines, setLines] = useState({})
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [updateCost, setUpdateCost] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
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
    const { data: sups } = await supabase.from('suppliers').select('id, name').eq('active', true).order('name')
    setSuppliers(sups || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  function lineFor(p) {
    return lines[p.id] || { qty: '', unit_cost: p.cost_price ?? 0, sale_price: p.sale_price ?? 0 }
  }

  function updateLine(p, patch) {
    setMessage('')
    setLines((prev) => ({ ...prev, [p.id]: { ...lineFor(p), ...patch } }))
  }

  function addScanned(p) {
    const next = (Number(lines[p.id]?.qty) || 0) + 1
    updateLine(p, { qty: String(next) })
    return { text: `✓ ${p.title} — ${next} unidad(es)`, ok: true }
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
    addScanned(p)
    setScannerOpen(true)
  }

  const loaded = products.filter((p) => Number(lines[p.id]?.qty) > 0)
  const totalUnits = loaded.reduce((s, p) => s + Number(lines[p.id].qty), 0)
  const total = loaded.reduce((s, p) => s + Number(lines[p.id].qty) * (Number(lines[p.id].unit_cost) || 0), 0)

  const filtered = products.filter((p) => {
    if (onlyLoaded && !(Number(lines[p.id]?.qty) > 0)) return false
    const q = search.toLowerCase()
    return !q || p.title.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.category || '').toLowerCase().includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function confirmPurchase() {
    if (loaded.length === 0) return
    if (!confirm(`¿Cargar ${totalUnits} unidad(es) de ${loaded.length} producto(s) por ${formatMoney(total)}? Se suma al inventario y se registra el gasto en Contabilidad.`)) return
    setSaving(true)
    setMessage('')

    // Registro de la compra como orden ya recibida (queda en el historial de Órdenes de compra)
    const { data: order, error } = await supabase
      .from('purchase_orders')
      .insert({
        supplier_id: supplierId || null,
        notes: notes || 'Carga de compra',
        status: 'received',
        received_date: localToday(),
      })
      .select()
      .single()

    if (error || !order) {
      setSaving(false)
      setMessage('No se pudo registrar la compra: ' + (error?.message || 'error desconocido'))
      return
    }

    await supabase.from('purchase_order_items').insert(
      loaded.map((p) => ({
        purchase_order_id: order.id,
        item_type: 'product',
        product_id: p.id,
        supply_id: null,
        description: '',
        qty: Number(lines[p.id].qty),
        unit_cost: Number(lines[p.id].unit_cost) || 0,
      }))
    )

    // Releer stock actual para no pisar ventas que hayan entrado mientras se cargaba
    const { data: fresh } = await supabase.from('products').select('id, stock_qty, ml_item_id').in('id', loaded.map((p) => p.id))
    const freshById = Object.fromEntries((fresh || []).map((p) => [p.id, p]))

    await Promise.all(loaded.map(async (p) => {
      const l = lines[p.id]
      const qty = Number(l.qty)
      const unitCost = Number(l.unit_cost) || 0
      const newQty = (freshById[p.id]?.stock_qty ?? p.stock_qty) + qty
      const patch = { stock_qty: newQty }
      if (updateCost && unitCost > 0) patch.cost_price = unitCost
      const salePrice = Number(l.sale_price)
      if (l.sale_price !== '' && salePrice > 0 && salePrice !== Number(p.sale_price)) patch.sale_price = salePrice
      await supabase.from('products').update(patch).eq('id', p.id)
      await supabase.from('stock_movements').insert({
        product_id: p.id,
        type: 'in',
        qty,
        reason: `Carga de compra — OC #${order.id}`,
      })
      if (p.ml_item_id) {
        if (patch.sale_price) {
          await fetch('/api/ml/listings?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', product_id: p.id, stock_qty: newQty, price: patch.sale_price }),
          }).catch(() => {})
        } else {
          await syncMlStock(p, newQty)
        }
      }
    }))

    if (total > 0) {
      const supplierName = suppliers.find((s) => String(s.id) === String(supplierId))?.name
      await supabase.from('accounting_entries').insert({
        type: 'expense',
        category: 'compra de stock',
        amount: total,
        description: `Carga de compra OC #${order.id}${supplierName ? ' — ' + supplierName : ''} (${totalUnits} unidades)`,
        entry_date: localToday(),
      })
    }

    setLines({})
    setNotes('')
    setSupplierId('')
    setOnlyLoaded(false)
    setSaving(false)
    setMessage(`✓ Compra OC #${order.id} cargada: ${totalUnits} unidades por ${formatMoney(total)}. Inventario actualizado.`)
    loadData()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Carga de compra</h1>
          <p>Cargá una compra grande: cantidad y costo por unidad de cada producto, y se suma al inventario</p>
        </div>
        <button className="btn btn-primary" onClick={() => setScannerOpen(true)}>📷 Escanear</button>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <select className="input" style={{ maxWidth: 220 }} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Proveedor (opcional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Notas (ej. N° de remito)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
          Actualizar costo del producto con el de esta compra
        </label>
      </div>

      {(loaded.length > 0 || message) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          {loaded.length > 0 ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {loaded.length} producto(s) · {totalUnits} unidad(es) · Total {formatMoney(total)}
              </span>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setLines({})}>Descartar</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={confirmPurchase}>
                  {saving ? 'Cargando…' : 'Confirmar compra'}
                </button>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600 }}>{message}</span>
          )}
        </div>
      )}
      {loaded.length > 0 && message && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>{message}</div>}

      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Buscar por título, SKU o categoría…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={onlyLoaded} onChange={(e) => { setOnlyLoaded(e.target.checked); setPage(1) }} />
          Ver solo los cargados ({loaded.length})
        </label>
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
                <th>Stock actual</th>
                <th>Cantidad comprada</th>
                <th>Costo por unidad</th>
                <th>Precio de venta</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const l = lineFor(p)
                const q = Number(l.qty) || 0
                return (
                  <tr key={p.id} style={q > 0 ? { background: 'var(--accent-soft)' } : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.title}</div>
                      {p.sku && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.sku}</div>}
                    </td>
                    <td>
                      {p.stock_qty}
                      {q > 0 && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}> → {p.stock_qty + q}</span>}
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        placeholder="0"
                        style={{ width: 80 }}
                        value={l.qty}
                        onChange={(e) => updateLine(p, { qty: e.target.value === '' ? '' : String(Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        min="0"
                        style={{ width: 110 }}
                        value={l.unit_cost}
                        onChange={(e) => updateLine(p, { unit_cost: e.target.value })}
                      />
                      {Number(l.unit_cost) !== Number(p.cost_price) && q > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>antes {formatMoney(p.cost_price)}</div>
                      )}
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        min="0"
                        style={{ width: 110 }}
                        value={l.sale_price}
                        onChange={(e) => updateLine(p, { sale_price: e.target.value })}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{q > 0 ? formatMoney(q * (Number(l.unit_cost) || 0)) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} />

      {scannerOpen && (
        <BarcodeScanner title="Escanear mercadería que llegó" onDetect={handleScan} onClose={() => setScannerOpen(false)} />
      )}
      {assignCode && (
        <AssignBarcode code={assignCode} products={products} onAssigned={handleAssigned} onClose={() => setAssignCode(null)} />
      )}
    </div>
  )
}
