import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Pagination, { PAGE_SIZE } from '../components/Pagination'

const EMPTY_FORM = { id: null, name: '', category: '', contact_name: '', phone: '', email: '', address: '', notes: '' }

export default function Proveedores() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function loadSuppliers() {
    setLoading(true)
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })
    setSuppliers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadSuppliers() }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(s) {
    setForm({
      id: s.id,
      name: s.name,
      category: s.category || '',
      contact_name: s.contact_name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      notes: s.notes || '',
    })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name,
      category: form.category,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
    }
    if (form.id) {
      await supabase.from('suppliers').update(payload).eq('id', form.id)
    } else {
      await supabase.from('suppliers').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    loadSuppliers()
  }

  async function handleDelete(s) {
    if (!confirm(`¿Eliminar "${s.name}"?`)) return
    await supabase.from('suppliers').update({ active: false }).eq('id', s.id)
    loadSuppliers()
  }

  function whatsappLink(phone) {
    const digits = phone.replace(/\D/g, '')
    return digits ? `https://wa.me/${digits}` : null
  }

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q) || (s.contact_name || '').toLowerCase().includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Proveedores</h1>
          <p>{suppliers.length} proveedores activos</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo proveedor</button>
      </div>

      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Buscar por nombre, rubro o contacto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay proveedores todavía. Agregá el primero.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Rubro</th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => {
                const wa = whatsappLink(s.phone)
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>{s.category ? <span className="badge badge-neutral">{s.category}</span> : '—'}</td>
                    <td>{s.contact_name || '—'}</td>
                    <td>
                      {s.phone ? (
                        wa ? (
                          <a href={wa} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }}>
                            {s.phone} ↗
                          </a>
                        ) : s.phone
                      ) : '—'}
                    </td>
                    <td>{s.email || '—'}</td>
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
          title={form.id ? 'Editar proveedor' : 'Nuevo proveedor'}
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
              <label>Nombre / Razón social *</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Rubro (qué provee)</label>
              <input className="input" placeholder="Repuestos motor, cadenas, insumos de embalaje…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="field">
              <label>Persona de contacto</label>
              <input className="input" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="field">
              <label>Teléfono / WhatsApp</label>
              <input className="input" placeholder="+549..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
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
