import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney, formatDate } from '../lib/format'
import Modal from '../components/Modal'

const STATUS_LABEL = { pending: 'Pendiente', received: 'Recibida', cancelled: 'Cancelada' }
const STATUS_BADGE = { pending: 'badge-warning', received: 'badge-green', cancelled: 'badge-danger' }

const EMPTY_ITEM = { item_type: 'product', product_id: '', supply_id: '', description: '', qty: 1, unit_cost: 0 }

export default function OrdenesCompra() {
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [supplies, setSupplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)

  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  const [detailOrder, setDetailOrder] = useState(null)

  async function loadAll() {
    setLoading(true)
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('*, suppliers(name), purchase_order_items(*, products(title), shipping_supplies(name))')
      .order('created_at', { ascending: false })
    setOrders(pos || [])

    const { data: sups } = await supabase.from('suppliers').select('id, name').eq('active', true).order('name')
    setSuppliers(sups || [])

    const { data: prods } = await supabase.from('products').select('id, title, cost_price').eq('active', true).order('title')
    setProducts(prods || [])

    const { data: sup } = await supabase.from('shipping_supplies').select('id, name, cost_price').eq('active', true).order('name')
    setSupplies(sup || [])

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function openNew() {
    setSupplierId('')
    setNotes('')
    setItems([{ ...EMPTY_ITEM }])
    setModalOpen(true)
  }

  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if (patch.product_id) {
        const p = products.find((p) => String(p.id) === String(patch.product_id))
        if (p) next.unit_cost = p.cost_price || 0
      }
      if (patch.supply_id) {
        const s = supplies.find((s) => String(s.id) === String(patch.supply_id))
        if (s) next.unit_cost = s.cost_price || 0
      }
      if (patch.item_type) {
        next.product_id = ''
        next.supply_id = ''
        next.unit_cost = 0
      }
      return next
    }))
  }

  function addItemRow() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }])
  }

  function removeItemRow(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0), 0)

  async function handleSave(e) {
    e.preventDefault()
    const validItems = items.filter((it) => (it.item_type === 'product' && it.product_id) || (it.item_type === 'supply' && it.supply_id) || (it.item_type === 'other' && it.description.trim()))
    if (validItems.length === 0) return
    setSaving(true)

    const { data: order } = await supabase
      .from('purchase_orders')
      .insert({ supplier_id: supplierId || null, notes })
      .select()
      .single()

    if (order) {
      await supabase.from('purchase_order_items').insert(
        validItems.map((it) => ({
          purchase_order_id: order.id,
          item_type: it.item_type,
          product_id: it.item_type === 'product' ? Number(it.product_id) : null,
          supply_id: it.item_type === 'supply' ? Number(it.supply_id) : null,
          description: it.item_type === 'other' ? it.description.trim() : '',
          qty: Number(it.qty) || 1,
          unit_cost: Number(it.unit_cost) || 0,
        }))
      )
    }

    setSaving(false)
    setModalOpen(false)
    loadAll()
  }

  async function markReceived(order) {
    if (!confirm('¿Confirmar que llegó esta orden? Se va a sumar el stock y registrar el gasto en Contabilidad.')) return
    setProcessing(true)

    for (const it of order.purchase_order_items || []) {
      if (it.item_type === 'product' && it.product_id) {
        const { data: p } = await supabase.from('products').select('stock_qty').eq('id', it.product_id).single()
        const newQty = (p?.stock_qty || 0) + it.qty
        await supabase.from('products').update({ stock_qty: newQty }).eq('id', it.product_id)
        await supabase.from('stock_movements').insert({
          product_id: it.product_id,
          type: 'in',
          qty: it.qty,
          reason: `Compra a proveedor — OC #${order.id}`,
        })
        if (it.unit_cost > 0) {
          await supabase.from('accounting_entries').insert({
            type: 'expense',
            category: 'compra de stock',
            amount: it.unit_cost * it.qty,
            description: `OC #${order.id} — ${it.products?.title || 'producto'} x${it.qty}`,
          })
        }
      } else if (it.item_type === 'supply' && it.supply_id) {
        const { data: s } = await supabase.from('shipping_supplies').select('stock_qty').eq('id', it.supply_id).single()
        const newQty = (s?.stock_qty || 0) + it.qty
        await supabase.from('shipping_supplies').update({ stock_qty: newQty }).eq('id', it.supply_id)
        await supabase.from('shipping_supply_movements').insert({
          supply_id: it.supply_id,
          type: 'in',
          qty: it.qty,
          reason: `Compra a proveedor — OC #${order.id}`,
        })
        if (it.unit_cost > 0) {
          await supabase.from('accounting_entries').insert({
            type: 'expense',
            category: 'insumos de envío',
            amount: it.unit_cost * it.qty,
            description: `OC #${order.id} — ${it.shipping_supplies?.name || 'insumo'} x${it.qty}`,
          })
        }
      } else if (it.item_type === 'other') {
        if (it.unit_cost > 0) {
          await supabase.from('accounting_entries').insert({
            type: 'expense',
            category: 'otros',
            amount: it.unit_cost * it.qty,
            description: `OC #${order.id} — ${it.description} x${it.qty}`,
          })
        }
      }
    }

    await supabase.from('purchase_orders').update({ status: 'received', received_date: new Date().toISOString().slice(0, 10) }).eq('id', order.id)
    setProcessing(false)
    setDetailOrder(null)
    loadAll()
  }

  async function cancelOrder(order) {
    if (!confirm('¿Cancelar esta orden de compra?')) return
    await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', order.id)
    setDetailOrder(null)
    loadAll()
  }

  async function deleteOrder(order) {
    if (!confirm('¿Eliminar esta orden de compra?')) return
    await supabase.from('purchase_orders').delete().eq('id', order.id)
    loadAll()
  }

  function orderTotal(order) {
    return (order.purchase_order_items || []).reduce((sum, it) => sum + it.qty * it.unit_cost, 0)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Órdenes de compra</h1>
          <p>Seguimiento de pedidos a proveedores</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nueva orden</button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">No hay órdenes de compra todavía.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Ítems</th>
                <th>Total estimado</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.order_date)}</td>
                  <td>{o.suppliers?.name || '—'}</td>
                  <td>{(o.purchase_order_items || []).length}</td>
                  <td style={{ fontWeight: 600 }}>{formatMoney(orderTotal(o))}</td>
                  <td><span className={'badge ' + (STATUS_BADGE[o.status] || 'badge-neutral')}>{STATUS_LABEL[o.status] || o.status}</span></td>
                  <td>
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => setDetailOrder(o)}>Detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Nueva orden de compra"
          onClose={() => setModalOpen(false)}
          actions={
            <>
              <button className="btn" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : `Guardar (${formatMoney(total)})`}
              </button>
            </>
          }
        >
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Proveedor</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Sin definir</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Ítems pedidos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="input" style={{ maxWidth: 110 }} value={it.item_type} onChange={(e) => updateItem(idx, { item_type: e.target.value })}>
                  <option value="product">Producto</option>
                  <option value="supply">Insumo envío</option>
                  <option value="other">Otro</option>
                </select>
                {it.item_type === 'product' && (
                  <select className="input" value={it.product_id} onChange={(e) => updateItem(idx, { product_id: e.target.value })}>
                    <option value="">Elegir producto…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                )}
                {it.item_type === 'supply' && (
                  <select className="input" value={it.supply_id} onChange={(e) => updateItem(idx, { supply_id: e.target.value })}>
                    <option value="">Elegir insumo…</option>
                    {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {it.item_type === 'other' && (
                  <input className="input" placeholder="Descripción" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                )}
                <input className="input" type="number" min="1" placeholder="Cant." style={{ maxWidth: 70 }} value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                <input className="input" type="number" step="0.01" placeholder="Costo unit." style={{ maxWidth: 110 }} value={it.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-danger" onClick={() => removeItemRow(idx)}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={addItemRow}>+ Agregar ítem</button>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Notas</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Modal>
      )}

      {detailOrder && (
        <Modal
          title={`Orden de compra #${detailOrder.id} — ${detailOrder.suppliers?.name || 'sin proveedor'}`}
          onClose={() => setDetailOrder(null)}
          actions={
            <>
              {detailOrder.status === 'pending' && (
                <>
                  <button className="btn btn-ghost btn-danger" disabled={processing} onClick={() => cancelOrder(detailOrder)}>Cancelar orden</button>
                  <button className="btn" disabled={processing} onClick={() => deleteOrder(detailOrder)}>Eliminar</button>
                  <button className="btn btn-primary" disabled={processing} onClick={() => markReceived(detailOrder)}>
                    {processing ? 'Procesando…' : '✓ Marcar como recibida'}
                  </button>
                </>
              )}
              <button className="btn" onClick={() => setDetailOrder(null)}>Cerrar</button>
            </>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <span className={'badge ' + (STATUS_BADGE[detailOrder.status] || 'badge-neutral')}>{STATUS_LABEL[detailOrder.status] || detailOrder.status}</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-dim)' }}>Pedida: {formatDate(detailOrder.order_date)}</span>
            {detailOrder.received_date && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-dim)' }}>Recibida: {formatDate(detailOrder.received_date)}</span>}
          </div>

          <table className="table" style={{ marginBottom: 12 }}>
            <thead>
              <tr><th>Ítem</th><th>Cant.</th><th>Costo unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {(detailOrder.purchase_order_items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.products?.title || it.shipping_supplies?.name || it.description}</td>
                  <td>{it.qty}</td>
                  <td>{formatMoney(it.unit_cost)}</td>
                  <td>{formatMoney(it.qty * it.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontWeight: 700, marginBottom: 12 }}>Total: {formatMoney(orderTotal(detailOrder))}</div>

          {detailOrder.notes && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Notas</label>
              <div style={{ fontSize: 13.5, marginTop: 4 }}>{detailOrder.notes}</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
