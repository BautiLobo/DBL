import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import Modal from '../components/Modal'
import Pagination, { PAGE_SIZE } from '../components/Pagination'

const EMPTY_FORM = { id: null, name: '', unit: 'unidad', stock_qty: '0', min_stock_alert: '5', cost_price: '', notes: '', photo_url: '' }

export default function MaterialesEnvio() {
  const [supplies, setSupplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [onlyLow, setOnlyLow] = useState(false)
  const [page, setPage] = useState(1)
  const [pendingDeltas, setPendingDeltas] = useState({})
  const [savingStock, setSavingStock] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function loadSupplies() {
    setLoading(true)
    const { data } = await supabase
      .from('shipping_supplies')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })
    setSupplies(data || [])
    setLoading(false)
  }

  useEffect(() => { loadSupplies() }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(s) {
    setForm({
      id: s.id,
      name: s.name,
      unit: s.unit || 'unidad',
      stock_qty: String(effectiveQty(s) ?? 0),
      min_stock_alert: String(s.min_stock_alert ?? 5),
      cost_price: s.cost_price ?? '',
      notes: s.notes || '',
      photo_url: s.photo_url || '',
    })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name,
      unit: form.unit || 'unidad',
      stock_qty: Number(form.stock_qty) || 0,
      min_stock_alert: Number(form.min_stock_alert) || 0,
      cost_price: Number(form.cost_price) || 0,
      notes: form.notes,
      photo_url: form.photo_url || null,
    }
    if (form.id) {
      await supabase.from('shipping_supplies').update(payload).eq('id', form.id)
      const prevQty = supplies.find((s) => s.id === form.id)?.stock_qty ?? payload.stock_qty
      const stockIncrease = payload.stock_qty - prevQty
      if (stockIncrease > 0 && payload.cost_price > 0) {
        await supabase.from('accounting_entries').insert({
          type: 'expense',
          category: 'insumos de envío',
          amount: payload.cost_price * stockIncrease,
          description: `Compra insumo de envío: ${payload.name} x${stockIncrease}`,
        })
      }
    } else {
      await supabase.from('shipping_supplies').insert(payload)
      if (payload.stock_qty > 0 && payload.cost_price > 0) {
        await supabase.from('accounting_entries').insert({
          type: 'expense',
          category: 'insumos de envío',
          amount: payload.cost_price * payload.stock_qty,
          description: `Compra insumo de envío inicial: ${payload.name} x${payload.stock_qty}`,
        })
      }
    }
    if (form.id) {
      setPendingDeltas((prev) => {
        const { [form.id]: _omit, ...rest } = prev
        return rest
      })
    }
    setSaving(false)
    setModalOpen(false)
    loadSupplies()
  }

  async function handleDelete(s) {
    if (!confirm(`¿Eliminar "${s.name}"?`)) return
    await supabase.from('shipping_supplies').update({ active: false }).eq('id', s.id)
    setPendingDeltas((prev) => {
      const { [s.id]: _omit, ...rest } = prev
      return rest
    })
    loadSupplies()
  }

  function effectiveQty(s) {
    return s.stock_qty + (pendingDeltas[s.id] || 0)
  }

  function bumpStock(s, delta) {
    setPendingDeltas((prev) => {
      const next = (prev[s.id] || 0) + delta
      if (s.stock_qty + next < 0) return prev
      if (next === 0) {
        const { [s.id]: _omit, ...rest } = prev
        return rest
      }
      return { ...prev, [s.id]: next }
    })
  }

  function discardStockChanges() {
    setPendingDeltas({})
  }

  async function saveStockChanges() {
    const changes = Object.entries(pendingDeltas).filter(([, delta]) => delta !== 0)
    if (changes.length === 0) return
    setSavingStock(true)
    await Promise.all(changes.map(async ([id, delta]) => {
      const s = supplies.find((ss) => String(ss.id) === id)
      if (!s) return
      const newQty = Math.max(0, s.stock_qty + delta)
      await supabase.from('shipping_supplies').update({ stock_qty: newQty }).eq('id', s.id)
      await supabase.from('shipping_supply_movements').insert({
        supply_id: s.id,
        type: delta > 0 ? 'in' : 'out',
        qty: Math.abs(delta),
        reason: delta > 0 ? 'Compra / reposición' : 'Uso en embalaje',
      })
      if (delta > 0 && s.cost_price > 0) {
        await supabase.from('accounting_entries').insert({
          type: 'expense',
          category: 'insumos de envío',
          amount: s.cost_price * delta,
          description: `Compra insumo de envío: ${s.name} x${delta}`,
        })
      }
    }))
    setPendingDeltas({})
    setSavingStock(false)
    loadSupplies()
  }

  const lowStock = supplies.filter((s) => s.stock_qty <= s.min_stock_alert)
  const filtered = onlyLow ? lowStock : supplies
  const toBuyCost = lowStock.reduce((sum, s) => sum + Math.max(0, s.min_stock_alert - s.stock_qty) * Number(s.cost_price || 0), 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pendingCount = Object.keys(pendingDeltas).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Materiales de envío</h1>
          <p>Insumos de embalaje para preparar los pedidos</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo insumo</button>
      </div>

      {pendingCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {pendingCount} {pendingCount === 1 ? 'insumo con cambio de stock sin guardar' : 'insumos con cambios de stock sin guardar'}
          </span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" className="btn btn-ghost" disabled={savingStock} onClick={discardStockChanges}>Descartar</button>
            <button type="button" className="btn btn-primary" disabled={savingStock} onClick={saveStockChanges}>
              {savingStock ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Insumos activos</div>
          <div className="stat-value">{supplies.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Para reponer</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{lowStock.length}</div>
        </div>
        {toBuyCost > 0 && (
          <div className="stat-card">
            <div className="stat-label">Costo estimado de reposición</div>
            <div className="stat-value">{formatMoney(toBuyCost)}</div>
          </div>
        )}
      </div>

      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          Mostrar solo lo que hay que comprar ({lowStock.length})
        </label>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {onlyLow ? 'No hay insumos por debajo del mínimo.' : 'No hay insumos cargados todavía.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Insumo</th>
                <th>Stock</th>
                <th>Mínimo</th>
                <th>Costo unit.</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => {
                const qty = effectiveQty(s)
                const low = qty <= s.min_stock_alert
                return (
                  <tr key={s.id}>
                    <td>
                      {s.photo_url ? (
                        <img src={s.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface-2)' }} />
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => bumpStock(s, -1)}>−</button>
                        <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, color: pendingDeltas[s.id] ? 'var(--accent)' : undefined }}>{qty}</span>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => bumpStock(s, 1)}>+</button>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.unit}</span>
                        {low && <span className="badge badge-danger">Comprar</span>}
                      </div>
                    </td>
                    <td>{s.min_stock_alert}</td>
                    <td>{s.cost_price ? formatMoney(s.cost_price) : '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{s.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" onClick={() => openEdit(s)}>Editar</button>
                        <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(s)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} />

      {modalOpen && (
        <Modal
          title={form.id ? 'Editar insumo' : 'Nuevo insumo'}
          onClose={() => setModalOpen(false)}
          actions={
            <>
              <button className="btn" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSave}>
            <div className="field span-2">
              <label>Nombre *</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Unidad</label>
              <input className="input" placeholder="unidad, rollo, paquete…" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div className="field">
              <label>Costo unitario</label>
              <input className="input" type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div className="field">
              <label>Stock actual</label>
              <input className="input" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
            </div>
            <div className="field">
              <label>Alerta stock mínimo</label>
              <input className="input" type="number" value={form.min_stock_alert} onChange={(e) => setForm({ ...form, min_stock_alert: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Notas</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>URL de la foto</label>
              <input className="input" placeholder="https://…" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
