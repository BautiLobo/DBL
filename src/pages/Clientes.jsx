import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney, formatDate } from '../lib/format'
import Modal from '../components/Modal'
import Pagination, { PAGE_SIZE } from '../components/Pagination'

const EMPTY_FORM = { id: null, name: '', phone: '', email: '', address: '', notes: '' }

export default function Clientes() {
  const [customers, setCustomers] = useState([])
  const [salesByCustomer, setSalesByCustomer] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function loadCustomers() {
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })
    setCustomers(data || [])

    const { data: sales } = await supabase
      .from('sales')
      .select('customer_id, total_amount, sale_date')
      .not('customer_id', 'is', null)

    const map = {}
    for (const s of sales || []) {
      if (!map[s.customer_id]) map[s.customer_id] = { count: 0, total: 0, last: null }
      map[s.customer_id].count += 1
      map[s.customer_id].total += Number(s.total_amount) || 0
      if (!map[s.customer_id].last || s.sale_date > map[s.customer_id].last) map[s.customer_id].last = s.sale_date
    }
    setSalesByCustomer(map)
    setLoading(false)
  }

  useEffect(() => { loadCustomers() }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(c) {
    setForm({ id: c.id, name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', notes: c.notes || '' })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { name: form.name, phone: form.phone, email: form.email, address: form.address, notes: form.notes }
    if (form.id) {
      await supabase.from('customers').update(payload).eq('id', form.id)
    } else {
      await supabase.from('customers').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    loadCustomers()
  }

  async function handleDelete(c) {
    if (!confirm(`¿Eliminar "${c.name}"?`)) return
    await supabase.from('customers').update({ active: false }).eq('id', c.id)
    loadCustomers()
  }

  function whatsappLink(phone) {
    const digits = (phone || '').replace(/\D/g, '')
    return digits ? `https://wa.me/${digits}` : null
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p>{customers.length} clientes</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo cliente</button>
      </div>

      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Buscar por nombre, teléfono o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay clientes todavía. Se crean solos al cargar una venta manual, o agregalos acá.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Compras</th>
                <th>Total gastado</th>
                <th>Última compra</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => {
                const wa = whatsappLink(c.phone)
                const stats = salesByCustomer[c.id]
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      {c.phone ? (
                        wa ? (
                          <a href={wa} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }}>
                            {c.phone} ↗
                          </a>
                        ) : c.phone
                      ) : '—'}
                    </td>
                    <td>{c.email || '—'}</td>
                    <td>{stats?.count || 0}</td>
                    <td>{formatMoney(stats?.total || 0)}</td>
                    <td>{stats?.last ? formatDate(stats.last) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" onClick={() => openEdit(c)}>Editar</button>
                        <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(c)}>Eliminar</button>
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
          title={form.id ? 'Editar cliente' : 'Nuevo cliente'}
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
              <label>Teléfono / WhatsApp</label>
              <input className="input" placeholder="+549..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Dirección</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Notas</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
