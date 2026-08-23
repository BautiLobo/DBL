import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney, formatDate } from '../lib/format'
import Modal from '../components/Modal'

const CATEGORIES = ['ventas', 'compra de stock', 'comision ml', 'envio', 'impuestos', 'servicios', 'otros']

export default function Contabilidad() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: 'income', category: 'ventas', amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10) })

  async function loadEntries() {
    setLoading(true)
    const { data } = await supabase.from('accounting_entries').select('*').order('entry_date', { ascending: false }).limit(300)
    setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => { loadEntries() }, [])

  const filtered = entries.filter((e) => typeFilter === 'all' || e.type === typeFilter)

  const totals = useMemo(() => {
    const income = entries.filter((e) => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
    const expense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)
    return { income, expense, balance: income - expense }
  }, [entries])

  function openNew() {
    setForm({ type: 'income', category: 'ventas', amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10) })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('accounting_entries').insert({
      type: form.type,
      category: form.category,
      amount: Number(form.amount) || 0,
      description: form.description,
      entry_date: form.entry_date,
    })
    setSaving(false)
    setModalOpen(false)
    loadEntries()
  }

  async function handleDelete(entry) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('accounting_entries').delete().eq('id', entry.id)
    loadEntries()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contabilidad</h1>
          <p>Ingresos y egresos del negocio</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Movimiento</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Ingresos</div>
          <div className="stat-value green">{formatMoney(totals.income)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Egresos</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{formatMoney(totals.expense)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Balance</div>
          <div className="stat-value accent">{formatMoney(totals.balance)}</div>
        </div>
      </div>

      <div className="toolbar">
        <select className="input" style={{ maxWidth: 180 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="income">Ingresos</option>
          <option value="expense">Egresos</option>
        </select>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay movimientos cargados.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td><span className={'badge ' + (e.type === 'income' ? 'badge-green' : 'badge-danger')}>{e.type === 'income' ? 'Ingreso' : 'Egreso'}</span></td>
                  <td>{e.category}</td>
                  <td>{e.description || '—'}</td>
                  <td style={{ fontWeight: 600, color: e.type === 'income' ? 'var(--green)' : 'var(--danger)' }}>
                    {e.type === 'income' ? '+' : '−'}{formatMoney(e.amount)}
                  </td>
                  <td><button className="btn btn-ghost btn-danger" onClick={() => handleDelete(e)}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Nuevo movimiento"
          onClose={() => setModalOpen(false)}
          actions={
            <>
              <button className="btn" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSave}>
            <div className="field">
              <label>Tipo</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="income">Ingreso</option>
                <option value="expense">Egreso</option>
              </select>
            </div>
            <div className="field">
              <label>Categoría</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Monto</label>
              <input className="input" type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input className="input" type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Descripción</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
