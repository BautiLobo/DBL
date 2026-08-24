import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney, formatDate } from '../lib/format'
import Modal from '../components/Modal'

const STATUS_LABEL = {
  pending: 'Pendiente',
  paid: 'Pagado',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}
const STATUS_BADGE = {
  pending: 'badge-warning',
  paid: 'badge-green',
  shipped: 'badge-orange',
  delivered: 'badge-green',
  cancelled: 'badge-danger',
}

const SHIP_STATUS_LABEL = {
  pending: 'Pendiente',
  handling: 'Preparando',
  ready_to_ship: 'Listo para enviar',
  shipped: 'Enviado',
  delivered: 'Entregado',
  not_delivered: 'No entregado',
  cancelled: 'Cancelado',
}
const SHIP_STATUS_BADGE = {
  pending: 'badge-warning',
  handling: 'badge-warning',
  ready_to_ship: 'badge-orange',
  shipped: 'badge-orange',
  delivered: 'badge-green',
  not_delivered: 'badge-danger',
  cancelled: 'badge-danger',
}

const EMPTY_ITEM = { product_id: '', qty: 1, unit_price: 0 }

export default function Pedidos() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [buyerName, setBuyerName] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  const [messagesSale, setMessagesSale] = useState(null)
  const [messages, setMessages] = useState(null)
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messagesError, setMessagesError] = useState('')

  async function loadData() {
    setLoading(true)
    const { data: salesData } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(title))')
      .order('created_at', { ascending: false })
      .limit(200)
    setSales(salesData || [])

    const { data: prods } = await supabase.from('products').select('id, title, sale_price, stock_qty').eq('active', true).order('title')
    setProducts(prods || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  function openNew() {
    setBuyerName('')
    setItems([{ ...EMPTY_ITEM }])
    setModalOpen(true)
  }

  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if (patch.product_id) {
        const p = products.find((p) => String(p.id) === String(patch.product_id))
        if (p) next.unit_price = p.sale_price
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

  const total = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0)

  async function handleSave(e) {
    e.preventDefault()
    const validItems = items.filter((it) => it.product_id)
    if (validItems.length === 0) return
    setSaving(true)

    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        source: 'manual',
        status: 'paid',
        buyer_name: buyerName,
        total_amount: total,
        net_amount: total,
      })
      .select()
      .single()

    if (!error && sale) {
      await supabase.from('sale_items').insert(
        validItems.map((it) => ({
          sale_id: sale.id,
          product_id: Number(it.product_id),
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
        }))
      )
      for (const it of validItems) {
        const p = products.find((p) => String(p.id) === String(it.product_id))
        if (p) {
          await supabase.from('products').update({ stock_qty: Math.max(0, p.stock_qty - Number(it.qty)) }).eq('id', p.id)
          await supabase.from('stock_movements').insert({
            product_id: p.id,
            type: 'out',
            qty: Number(it.qty),
            reason: 'Venta manual',
            related_sale_id: sale.id,
          })
        }
      }
    }

    setSaving(false)
    setModalOpen(false)
    loadData()
  }

  async function refreshShipping(sale) {
    try {
      const res = await fetch('/api/ml/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: sale.id }),
      })
      if (res.ok) loadData()
    } catch {
      // silencioso: el usuario puede reintentar tocando el botón de nuevo
    }
  }

  async function openMessages(sale) {
    setMessagesSale(sale)
    setMessages(null)
    setMessageText('')
    setMessagesError('')
    try {
      const res = await fetch('/api/ml/messages?sale_id=' + sale.id)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error trayendo mensajes')
      setMessages(data.messages || [])
    } catch (e) {
      setMessagesError(e.message)
    }
  }

  async function sendMessage() {
    if (!messageText.trim() || !messagesSale) return
    setSendingMessage(true)
    setMessagesError('')
    try {
      const res = await fetch('/api/ml/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: messagesSale.id, text: messageText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error enviando el mensaje')
      setMessageText('')
      openMessages(messagesSale)
    } catch (e) {
      setMessagesError(e.message)
    }
    setSendingMessage(false)
  }

  const filtered = sales.filter((s) => filter === 'all' || s.source === filter)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pedidos</h1>
          <p>Ventas de Mercado Libre y cargadas a mano</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Venta manual</button>
      </div>

      <div className="toolbar">
        <select className="input" style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos los orígenes</option>
          <option value="mercadolibre">Mercado Libre</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            Todavía no hay pedidos. Los pedidos de Mercado Libre van a aparecer acá automáticamente
            una vez que conectes tu cuenta en Configuración.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Comprador</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Envío</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.sale_date || s.created_at)}</td>
                  <td>
                    <span className={'badge ' + (s.source === 'mercadolibre' ? 'badge-orange' : 'badge-neutral')}>
                      {s.source === 'mercadolibre' ? 'Mercado Libre' : 'Manual'}
                    </span>
                  </td>
                  <td>{s.buyer_name || '—'}</td>
                  <td>{(s.sale_items || []).map((it) => it.products?.title).filter(Boolean).join(', ') || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{formatMoney(s.total_amount)}</td>
                  <td><span className={'badge ' + (STATUS_BADGE[s.status] || 'badge-neutral')}>{STATUS_LABEL[s.status] || s.status}</span></td>
                  <td>
                    {s.ml_shipment_id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={'badge ' + (SHIP_STATUS_BADGE[s.shipping_status] || 'badge-neutral')}>
                          {SHIP_STATUS_LABEL[s.shipping_status] || s.shipping_status || 'Sin datos'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '2px 6px', fontSize: 12 }}
                          title="Actualizar estado de envío"
                          onClick={() => refreshShipping(s)}
                        >
                          ↻
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {s.source === 'mercadolibre' && s.ml_order_id && (
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => openMessages(s)}>
                        💬 Mensajes
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Nueva venta manual"
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
            <label>Comprador</label>
            <input className="input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Productos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6 }}>
                <select className="input" value={it.product_id} onChange={(e) => updateItem(idx, { product_id: e.target.value })}>
                  <option value="">Elegir producto…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.title} (stock: {p.stock_qty})</option>)}
                </select>
                <input className="input" type="number" min="1" style={{ maxWidth: 70 }} value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                <input className="input" type="number" step="0.01" style={{ maxWidth: 110 }} value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-danger" onClick={() => removeItemRow(idx)}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={addItemRow}>+ Agregar producto</button>
        </Modal>
      )}

      {messagesSale && (
        <Modal
          title={`Mensajes — ${messagesSale.buyer_name || 'comprador'}`}
          onClose={() => setMessagesSale(null)}
          actions={<button className="btn" onClick={() => setMessagesSale(null)}>Cerrar</button>}
        >
          {messagesError && <div className="auth-error" style={{ marginBottom: 10 }}>{messagesError}</div>}

          {messages === null ? (
            <div className="empty-state">Cargando…</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">Todavía no hay mensajes en este pedido.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.from_buyer ? 'flex-start' : 'flex-end',
                    background: m.from_buyer ? 'var(--surface-2)' : 'var(--accent-soft)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    maxWidth: '80%',
                    fontSize: 13.5,
                  }}
                >
                  {m.text}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <input
              className="input"
              placeholder="Escribir un mensaje…"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button className="btn btn-primary" disabled={sendingMessage} onClick={sendMessage}>
              {sendingMessage ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
