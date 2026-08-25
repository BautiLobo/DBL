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

  const [detailSale, setDetailSale] = useState(null)
  const [detailMovements, setDetailMovements] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  async function loadData() {
    setLoading(true)
    const { data: salesData } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(title))')
      .order('created_at', { ascending: false })
      .limit(200)
    setSales(salesData || [])

    const { data: prods } = await supabase.from('products').select('id, title, sale_price, cost_price, stock_qty').eq('active', true).order('title')
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
      let cogs = 0
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
          cogs += (Number(p.cost_price) || 0) * Number(it.qty)
        }
      }
      await supabase.from('accounting_entries').insert([
        {
          type: 'income',
          category: 'ventas',
          amount: total,
          description: `Venta manual${buyerName ? ' — ' + buyerName : ''}`,
          related_sale_id: sale.id,
        },
        {
          type: 'expense',
          category: 'costo de mercadería',
          amount: cogs,
          description: `Costo de mercadería — venta #${sale.id}`,
          related_sale_id: sale.id,
        },
      ])
    }

    setSaving(false)
    setModalOpen(false)
    loadData()
  }

  async function refreshDetailSale(saleId) {
    const { data } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(title))')
      .eq('id', saleId)
      .single()
    if (data) setDetailSale(data)
  }

  async function refreshShipping(sale) {
    try {
      const res = await fetch('/api/ml/orders?action=refresh-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh-shipping', sale_id: sale.id }),
      })
      if (res.ok) {
        loadData()
        if (detailSale?.id === sale.id) refreshDetailSale(sale.id)
      }
    } catch {
      // silencioso: el usuario puede reintentar tocando el botón de nuevo
    }
  }

  async function openDetail(sale) {
    setDetailSale(sale)
    setNotesDraft(sale.notes || '')
    setDetailMovements(null)
    const { data } = await supabase
      .from('stock_movements')
      .select('*, products(title)')
      .eq('related_sale_id', sale.id)
      .order('created_at', { ascending: false })
    setDetailMovements(data || [])
  }

  async function saveNotes() {
    if (!detailSale) return
    setSavingNotes(true)
    await supabase.from('sales').update({ notes: notesDraft }).eq('id', detailSale.id)
    setSavingNotes(false)
    setDetailSale((s) => ({ ...s, notes: notesDraft }))
    loadData()
  }

  async function changeStatus(newStatus) {
    if (!detailSale) return
    setStatusSaving(true)
    await supabase.from('sales').update({ status: newStatus }).eq('id', detailSale.id)
    setStatusSaving(false)
    setDetailSale((s) => ({ ...s, status: newStatus }))
    loadData()
  }

  async function openMessages(sale) {
    setMessagesSale(sale)
    setMessages(null)
    setMessageText('')
    setMessagesError('')
    try {
      const res = await fetch('/api/ml/orders?action=messages&sale_id=' + sale.id)
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
      const res = await fetch('/api/ml/orders?action=send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-message', sale_id: messagesSale.id, text: messageText }),
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
                      <div>
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
                        {s.tracking_number && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>#{s.tracking_number}</div>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 12 }} onClick={() => openDetail(s)}>Detalle</button>
                      {s.source === 'mercadolibre' && s.ml_order_id && (
                        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => openMessages(s)}>
                          💬
                        </button>
                      )}
                    </div>
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

      {detailSale && (
        <Modal
          title={`Pedido ${detailSale.ml_order_id ? '#' + detailSale.ml_order_id : '#' + detailSale.id}`}
          onClose={() => setDetailSale(null)}
          actions={
            <>
              {detailSale.source === 'mercadolibre' && detailSale.ml_order_id && (
                <button className="btn" onClick={() => openMessages(detailSale)}>💬 Mensajes</button>
              )}
              <button className="btn btn-primary" onClick={() => setDetailSale(null)}>Cerrar</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Origen</div>
              <span className={'badge ' + (detailSale.source === 'mercadolibre' ? 'badge-orange' : 'badge-neutral')}>
                {detailSale.source === 'mercadolibre' ? 'Mercado Libre' : 'Manual'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Fecha</div>
              <div>{formatDate(detailSale.sale_date || detailSale.created_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Comprador</div>
              <div>{detailSale.buyer_name || '—'}</div>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Estado</label>
            <select
              className="input"
              value={detailSale.status}
              disabled={statusSaving}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {detailSale.ml_shipment_id && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Envío</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span className={'badge ' + (SHIP_STATUS_BADGE[detailSale.shipping_status] || 'badge-neutral')}>
                  {SHIP_STATUS_LABEL[detailSale.shipping_status] || detailSale.shipping_status || 'Sin datos'}
                </span>
                {detailSale.tracking_number && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>#{detailSale.tracking_number}</span>}
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => refreshShipping(detailSale)}>
                  ↻ Actualizar
                </button>
              </div>
            </div>
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Productos</label>
          <table className="table" style={{ marginTop: 6, marginBottom: 16 }}>
            <thead>
              <tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {(detailSale.sale_items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.products?.title || '—'}</td>
                  <td>{it.qty}</td>
                  <td>{formatMoney(it.unit_price)}</td>
                  <td>{formatMoney(it.qty * it.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, fontSize: 13.5 }}>
            <div><span style={{ color: 'var(--text-dim)' }}>Total: </span><strong>{formatMoney(detailSale.total_amount)}</strong></div>
            {detailSale.ml_fee > 0 && <div><span style={{ color: 'var(--text-dim)' }}>Comisión ML: </span>{formatMoney(detailSale.ml_fee)}</div>}
            {detailSale.shipping_cost > 0 && <div><span style={{ color: 'var(--text-dim)' }}>Envío: </span>{formatMoney(detailSale.shipping_cost)}</div>}
            <div><span style={{ color: 'var(--text-dim)' }}>Neto: </span><strong>{formatMoney(detailSale.net_amount)}</strong></div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Notas</label>
            <textarea
              className="input"
              rows={2}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              style={{ marginTop: 6, alignSelf: 'flex-start' }}
              disabled={savingNotes || notesDraft === (detailSale.notes || '')}
              onClick={saveNotes}
            >
              {savingNotes ? 'Guardando…' : 'Guardar notas'}
            </button>
          </div>

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Movimientos de stock</label>
          {detailMovements === null ? (
            <div className="empty-state" style={{ padding: 12 }}>Cargando…</div>
          ) : detailMovements.length === 0 ? (
            <div className="empty-state" style={{ padding: 12 }}>Sin movimientos registrados.</div>
          ) : (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detailMovements.map((m) => (
                <div key={m.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                  <span>{m.products?.title || '—'}</span>
                  <span style={{ color: m.type === 'out' ? 'var(--danger)' : 'var(--green)' }}>
                    {m.type === 'out' ? '−' : '+'}{m.qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
