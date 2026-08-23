import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import Modal from '../components/Modal'

const EMPTY_FORM = {
  id: null,
  sku: '',
  title: '',
  description: '',
  category: '',
  brand_compat: '',
  cost_price: '',
  sale_price: '',
  stock_qty: '',
  min_stock_alert: '2',
  ml_item_id: '',
}

export default function Inventario() {
  const [products, setProducts] = useState([])
  const [photosByProduct, setPhotosByProduct] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function loadProducts() {
    setLoading(true)
    const { data: prods } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    setProducts(prods || [])

    const { data: photos } = await supabase
      .from('product_photos')
      .select('*')
      .order('sort_order', { ascending: true })

    const map = {}
    for (const p of photos || []) {
      if (!map[p.product_id]) map[p.product_id] = []
      map[p.product_id].push(p)
    }
    setPhotosByProduct(map)
    setLoading(false)
  }

  useEffect(() => { loadProducts() }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(p) {
    setForm({
      id: p.id,
      sku: p.sku || '',
      title: p.title || '',
      description: p.description || '',
      category: p.category || '',
      brand_compat: p.brand_compat || '',
      cost_price: p.cost_price ?? '',
      sale_price: p.sale_price ?? '',
      stock_qty: p.stock_qty ?? '',
      min_stock_alert: p.min_stock_alert ?? '2',
      ml_item_id: p.ml_item_id || '',
    })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      sku: form.sku || null,
      title: form.title,
      description: form.description,
      category: form.category,
      brand_compat: form.brand_compat,
      cost_price: Number(form.cost_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      min_stock_alert: Number(form.min_stock_alert) || 0,
      ml_item_id: form.ml_item_id || null,
    }

    if (form.id) {
      await supabase.from('products').update(payload).eq('id', form.id)
    } else {
      await supabase.from('products').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    loadProducts()
  }

  async function handleDelete(p) {
    if (!confirm(`¿Eliminar "${p.title}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('products').update({ active: false }).eq('id', p.id)
    loadProducts()
  }

  async function adjustStock(p, delta) {
    const newQty = Math.max(0, p.stock_qty + delta)
    await supabase.from('products').update({ stock_qty: newQty }).eq('id', p.id)
    await supabase.from('stock_movements').insert({
      product_id: p.id,
      type: delta > 0 ? 'in' : 'out',
      qty: Math.abs(delta),
      reason: 'Ajuste manual',
    })
    loadProducts()
  }

  async function handlePhotoUpload(productId, file) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${productId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('product-photos').upload(path, file)
    if (!error) {
      await supabase.from('product_photos').insert({ product_id: productId, storage_path: path })
      loadProducts()
    }
    setUploading(false)
  }

  async function handlePhotoDelete(photo) {
    await supabase.storage.from('product-photos').remove([photo.storage_path])
    await supabase.from('product_photos').delete().eq('id', photo.id)
    loadProducts()
  }

  function photoUrl(path) {
    return supabase.storage.from('product-photos').getPublicUrl(path).data.publicUrl
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return !q || p.title.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
  })

  const editingPhotos = form.id ? (photosByProduct[form.id] || []) : []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inventario</h1>
          <p>{products.length} productos activos</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo producto</button>
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar por título, SKU o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay productos todavía. Agregá el primero.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Producto</th>
                <th>SKU</th>
                <th>Categoría</th>
                <th>Costo</th>
                <th>Precio</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const photos = photosByProduct[p.id] || []
                const low = p.stock_qty <= p.min_stock_alert
                return (
                  <tr key={p.id}>
                    <td>
                      {photos[0] ? (
                        <img src={photoUrl(photos[0].storage_path)} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface-2)' }} />
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.title}</div>
                      {p.brand_compat && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.brand_compat}</div>}
                    </td>
                    <td>{p.sku || '—'}</td>
                    <td>{p.category || '—'}</td>
                    <td>{formatMoney(p.cost_price)}</td>
                    <td>{formatMoney(p.sale_price)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => adjustStock(p, -1)}>−</button>
                        <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{p.stock_qty}</span>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => adjustStock(p, 1)}>+</button>
                        {low && <span className="badge badge-danger">Bajo</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" onClick={() => openEdit(p)}>Editar</button>
                        <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(p)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={form.id ? 'Editar producto' : 'Nuevo producto'}
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
              <label>Título *</label>
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>SKU</label>
              <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="field">
              <label>Categoría</label>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Compatibilidad (marcas/modelos)</label>
              <input className="input" placeholder="Honda Wave, Yamaha Crypton…" value={form.brand_compat} onChange={(e) => setForm({ ...form, brand_compat: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>Descripción</label>
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="field">
              <label>Costo</label>
              <input className="input" type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div className="field">
              <label>Precio de venta</label>
              <input className="input" type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
            </div>
            <div className="field">
              <label>Stock</label>
              <input className="input" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
            </div>
            <div className="field">
              <label>Alerta stock mínimo</label>
              <input className="input" type="number" value={form.min_stock_alert} onChange={(e) => setForm({ ...form, min_stock_alert: e.target.value })} />
            </div>
            <div className="field span-2">
              <label>ID publicación Mercado Libre (opcional)</label>
              <input className="input" placeholder="MLA123456789" value={form.ml_item_id} onChange={(e) => setForm({ ...form, ml_item_id: e.target.value })} />
            </div>
          </form>

          {form.id && (
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Fotos</label>
              <div className="photo-row">
                {editingPhotos.map((photo) => (
                  <div className="photo-thumb" key={photo.id}>
                    <img src={photoUrl(photo.storage_path)} alt="" />
                    <button className="remove-photo" onClick={() => handlePhotoDelete(photo)}>×</button>
                  </div>
                ))}
                <label className="photo-upload-btn">
                  {uploading ? '…' : '+'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files[0] && handlePhotoUpload(form.id, e.target.files[0])}
                  />
                </label>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
