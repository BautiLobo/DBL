import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import Modal from '../components/Modal'

const CATEGORIES = [
  'Motor',
  'Transmisión',
  'Frenos',
  'Suspensión y Dirección',
  'Sistema Eléctrico',
  'Carrocería y Plásticos',
  'Escape',
  'Neumáticos y Ruedas',
  'Filtros y Lubricantes',
  'Accesorios',
  'Indumentaria y Cascos',
  'Herramientas',
  'Otros',
]

const PART_TYPE_LABEL = { original: 'Original', alternativo: 'Alternativo', usado: 'Usado' }
const PART_TYPE_BADGE = { original: 'badge-green', alternativo: 'badge-orange', usado: 'badge-neutral' }

const EMPTY_FORM = {
  id: null,
  sku: '',
  title: '',
  description: '',
  category: CATEGORIES[0],
  part_type: 'alternativo',
  brand_compat: '',
  cost_price: '',
  sale_price: '',
  stock_qty: '',
  min_stock_alert: '2',
  ml_item_id: '',
}

const ML_STATUS_LABEL = { active: 'Activa', paused: 'Pausada', closed: 'Finalizada' }
const ML_STATUS_BADGE = { active: 'badge-green', paused: 'badge-warning', closed: 'badge-neutral' }

// Mercado Libre solo acepta JPG/PNG, hasta 10MB, y mínimo 500x500px por foto.
const ML_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png']
const ML_MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ML_MIN_IMAGE_DIMENSION = 500

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

export default function Inventario() {
  const [products, setProducts] = useState([])
  const [photosByProduct, setPhotosByProduct] = useState({})
  const [variantsByProduct, setVariantsByProduct] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const [mlBusy, setMlBusy] = useState(false)
  const [mlError, setMlError] = useState('')
  const [browseStack, setBrowseStack] = useState([])
  const [browseNode, setBrowseNode] = useState(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryAttrs, setCategoryAttrs] = useState([])
  const [attrValues, setAttrValues] = useState({})
  const [condition, setCondition] = useState('new')
  const [reviews, setReviews] = useState(null)
  const [variants, setVariants] = useState([])
  const [removedVariantIds, setRemovedVariantIds] = useState([])
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [publishProductId, setPublishProductId] = useState(null)

  const editingProduct = form.id ? products.find((p) => p.id === form.id) : null
  const publishingProduct = publishProductId ? products.find((p) => p.id === publishProductId) : null

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

    const { data: vs } = await supabase.from('product_variants').select('*').order('id')
    const vmap = {}
    for (const v of vs || []) {
      if (!vmap[v.product_id]) vmap[v.product_id] = []
      vmap[v.product_id].push(v)
    }
    setVariantsByProduct(vmap)

    setLoading(false)
  }

  useEffect(() => { loadProducts() }, [])

  function resetMlUi() {
    setMlError('')
    setSelectedCategory(null)
    setCategoryAttrs([])
    setAttrValues({})
    setCondition('new')
    setBrowseStack([])
    setBrowseNode(null)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    resetMlUi()
    setVariants([])
    setRemovedVariantIds([])
    setPhotoError('')
    setModalOpen(true)
  }

  function openEdit(p) {
    setForm({
      id: p.id,
      sku: p.sku || '',
      title: p.title || '',
      description: p.description || '',
      category: p.category || CATEGORIES[0],
      part_type: p.part_type || 'alternativo',
      brand_compat: p.brand_compat || '',
      cost_price: p.cost_price ?? '',
      sale_price: p.sale_price ?? '',
      stock_qty: p.stock_qty ?? '',
      min_stock_alert: p.min_stock_alert ?? '2',
      ml_item_id: p.ml_item_id || '',
    })
    resetMlUi()
    setVariants(
      (variantsByProduct[p.id] || []).map((v) => ({
        id: v.id,
        talle: v.attributes?.Talle || '',
        color: v.attributes?.Color || '',
        sku: v.sku || '',
        stock_qty: v.stock_qty,
        ml_variation_id: v.ml_variation_id,
      }))
    )
    setRemovedVariantIds([])
    setPhotoError('')
    setModalOpen(true)
  }

  function openPublish(p) {
    resetMlUi()
    setPublishProductId(p.id)
    setPublishModalOpen(true)
  }

  function addVariantRow() {
    setVariants((prev) => [...prev, { id: null, talle: '', color: '', sku: '', stock_qty: 0, ml_variation_id: null }])
  }

  function updateVariantRow(idx, patch) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)))
  }

  function removeVariantRow(idx) {
    setVariants((prev) => {
      const target = prev[idx]
      if (target?.id) setRemovedVariantIds((ids) => [...ids, target.id])
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function loadReviews(itemId) {
    setReviews(null)
    try {
      const res = await fetch('/api/ml/listings?action=reviews&item_id=' + encodeURIComponent(itemId))
      const data = await res.json()
      if (res.ok) setReviews(data)
    } catch {
      // silencioso: la sección de reseñas queda vacía
    }
  }

  useEffect(() => {
    if (publishModalOpen && publishingProduct?.ml_item_id) {
      loadReviews(publishingProduct.ml_item_id)
    } else {
      setReviews(null)
    }
  }, [publishModalOpen, publishingProduct?.ml_item_id])

  async function loadCategoryNode(id) {
    setBrowseLoading(true)
    setMlError('')
    try {
      const res = await fetch('/api/ml/listings?action=category-children' + (id ? '&id=' + encodeURIComponent(id) : ''))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error consultando categorías')
      setBrowseNode(data)
    } catch (e) {
      setMlError(e.message)
    }
    setBrowseLoading(false)
  }

  useEffect(() => {
    if (publishModalOpen && publishingProduct && !publishingProduct.ml_item_id) {
      setBrowseStack([])
      loadCategoryNode(null)
    }
  }, [publishModalOpen, publishingProduct?.id])

  function browseInto(child) {
    setBrowseStack((prev) => [...prev, child])
    loadCategoryNode(child.id)
  }

  function browseBackTo(idx) {
    const newStack = browseStack.slice(0, idx + 1)
    setBrowseStack(newStack)
    loadCategoryNode(newStack.length ? newStack[newStack.length - 1].id : null)
  }

  function browseHome() {
    setBrowseStack([])
    loadCategoryNode(null)
  }

  async function selectCategory() {
    if (!browseNode) return
    setSelectedCategory({ category_id: browseNode.id, category_name: browseNode.name })
    setMlBusy(true)
    setMlError('')
    try {
      const res = await fetch('/api/ml/listings?action=category-attributes&id=' + encodeURIComponent(browseNode.id))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error consultando atributos de la categoría')
      setCategoryAttrs(data.attributes || [])
      setAttrValues({})
    } catch (e) {
      setMlError(e.message)
    }
    setMlBusy(false)
  }

  function clearSelectedCategory() {
    setSelectedCategory(null)
    setCategoryAttrs([])
    setAttrValues({})
  }

  async function publishToMl() {
    if (!selectedCategory || !publishProductId) return
    const missing = categoryAttrs.filter((a) => !(attrValues[a.id] || '').trim())
    if (missing.length > 0) {
      setMlError(`Completá los campos obligatorios: ${missing.map((a) => a.name).join(', ')}`)
      return
    }
    if (publishingPhotos.length === 0) {
      setMlError('Subí al menos una foto entrando a "Editar" antes de publicar.')
      return
    }
    setMlBusy(true)
    setMlError('')
    try {
      const res = await fetch('/api/ml/listings?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          product_id: publishProductId,
          category_id: selectedCategory.category_id,
          condition,
          listing_type_id: 'gold_special',
          attributes: categoryAttrs.map((a) => ({ id: a.id, value_name: attrValues[a.id] })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error + (data.detail ? ': ' + data.detail : ''))
      clearSelectedCategory()
      loadProducts()
    } catch (e) {
      setMlError(e.message)
    }
    setMlBusy(false)
  }

  async function changeMlStatus(status) {
    if (status === 'closed' && !confirm('¿Finalizar esta publicación? Mercado Libre no permite reabrirla.')) return
    setMlBusy(true)
    setMlError('')
    try {
      const res = await fetch('/api/ml/listings?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', product_id: publishProductId, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error actualizando la publicación')
      loadProducts()
    } catch (e) {
      setMlError(e.message)
    }
    setMlBusy(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      sku: form.sku || null,
      title: form.title,
      description: form.description,
      category: form.category,
      part_type: form.part_type,
      brand_compat: form.brand_compat,
      cost_price: Number(form.cost_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      min_stock_alert: Number(form.min_stock_alert) || 0,
      ml_item_id: form.ml_item_id || null,
    }

    let productId = form.id

    if (form.id) {
      await supabase.from('products').update(payload).eq('id', form.id)
      if (editingProduct?.ml_item_id) {
        fetch('/api/ml/listings?action=update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', product_id: form.id, price: payload.sale_price, stock_qty: payload.stock_qty }),
        }).catch(() => {})
      }
    } else {
      const { data: inserted } = await supabase.from('products').insert(payload).select().single()
      productId = inserted?.id
    }

    if (productId) await syncVariants(productId)

    setSaving(false)
    setModalOpen(false)
    loadProducts()
  }

  async function syncVariants(productId) {
    if (removedVariantIds.length > 0) {
      await supabase.from('product_variants').delete().in('id', removedVariantIds)
    }
    for (const v of variants) {
      const attributes = {}
      if (v.talle?.trim()) attributes.Talle = v.talle.trim()
      if (v.color?.trim()) attributes.Color = v.color.trim()
      const row = { product_id: productId, attributes, sku: v.sku || null, stock_qty: Number(v.stock_qty) || 0 }

      if (v.id) {
        await supabase.from('product_variants').update(row).eq('id', v.id)
        if (v.ml_variation_id) {
          fetch('/api/ml/listings?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', product_id: productId, variant_id: v.id, variant_stock_qty: row.stock_qty }),
          }).catch(() => {})
        }
      } else if (Object.keys(attributes).length > 0) {
        await supabase.from('product_variants').insert(row)
      }
    }
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
    setPhotoError('')
    if (!ML_ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setPhotoError('Mercado Libre solo acepta fotos en formato JPG o PNG.')
      return
    }
    if (file.size > ML_MAX_IMAGE_BYTES) {
      setPhotoError('Mercado Libre no acepta fotos de más de 10 MB.')
      return
    }
    try {
      const { width, height } = await getImageDimensions(file)
      if (width < ML_MIN_IMAGE_DIMENSION || height < ML_MIN_IMAGE_DIMENSION) {
        setPhotoError(`Mercado Libre exige fotos de al menos ${ML_MIN_IMAGE_DIMENSION}x${ML_MIN_IMAGE_DIMENSION}px (esta es ${width}x${height}px).`)
        return
      }
    } catch {
      setPhotoError('No se pudo leer la foto, probá con otro archivo.')
      return
    }
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
    const matchesSearch = !q || p.title.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter
    const matchesType = typeFilter === 'all' || p.part_type === typeFilter
    return matchesSearch && matchesCategory && matchesType
  })

  const categoryCounts = CATEGORIES.reduce((acc, c) => {
    acc[c] = products.filter((p) => p.category === c).length
    return acc
  }, {})

  const editingPhotos = form.id ? (photosByProduct[form.id] || []) : []
  const publishingPhotos = publishProductId ? (photosByProduct[publishProductId] || []) : []

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
          style={{ maxWidth: 260 }}
          placeholder="Buscar por título, SKU o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" style={{ maxWidth: 220 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">Todas las categorías ({products.length})</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c} ({categoryCounts[c]})</option>
          ))}
        </select>
        <select className="input" style={{ maxWidth: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Todos los tipos</option>
          {Object.entries(PART_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
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
                <th>Tipo</th>
                <th>Costo</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>ML</th>
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
                    <td>{p.category ? <span className="badge badge-neutral">{p.category}</span> : '—'}</td>
                    <td>
                      <span className={'badge ' + (PART_TYPE_BADGE[p.part_type] || 'badge-neutral')}>
                        {PART_TYPE_LABEL[p.part_type] || p.part_type}
                      </span>
                    </td>
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
                      {p.ml_item_id ? (
                        <span className={'badge ' + (ML_STATUS_BADGE[p.ml_status] || 'badge-neutral')}>
                          {ML_STATUS_LABEL[p.ml_status] || p.ml_status}
                        </span>
                      ) : (
                        <span className="badge badge-neutral">No publicado</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.ml_item_id ? (
                          <button className="btn" onClick={() => openPublish(p)}>Gestionar ML</button>
                        ) : (
                          <button className="btn btn-primary" onClick={() => openPublish(p)}>Publicar en ML</button>
                        )}
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
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo</label>
              <select className="input" value={form.part_type} onChange={(e) => setForm({ ...form, part_type: e.target.value })}>
                {Object.entries(PART_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
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
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>JPG o PNG, hasta 10 MB, mínimo 500x500px (formato exigido por Mercado Libre)</div>
              {photoError && <div className="auth-error" style={{ marginTop: 8 }}>{photoError}</div>}
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
                    accept="image/jpeg,image/png"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files[0] && handlePhotoUpload(form.id, e.target.files[0])}
                  />
                </label>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Variantes (talle / color)</label>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addVariantRow}>+ Agregar variante</button>
            </div>
            {variants.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Sin variantes: este producto se publica como un único ítem. Agregá variantes si vendés el mismo producto en distintos talles o colores.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {variants.map((v, idx) => (
                  <div key={v.id ?? `new-${idx}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="input" placeholder="Talle" style={{ maxWidth: 90 }} value={v.talle} onChange={(e) => updateVariantRow(idx, { talle: e.target.value })} />
                    <input className="input" placeholder="Color" style={{ maxWidth: 90 }} value={v.color} onChange={(e) => updateVariantRow(idx, { color: e.target.value })} />
                    <input className="input" placeholder="SKU" style={{ maxWidth: 90 }} value={v.sku} onChange={(e) => updateVariantRow(idx, { sku: e.target.value })} />
                    <input className="input" type="number" placeholder="Stock" style={{ maxWidth: 70 }} value={v.stock_qty} onChange={(e) => updateVariantRow(idx, { stock_qty: e.target.value })} />
                    {v.ml_variation_id && <span className="badge badge-green" style={{ flexShrink: 0 }}>En ML</span>}
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => removeVariantRow(idx)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </Modal>
      )}

      {publishModalOpen && publishingProduct && (
        <Modal
          title={publishingProduct.ml_item_id ? `Gestionar en Mercado Libre — ${publishingProduct.title}` : `Publicar en Mercado Libre — ${publishingProduct.title}`}
          onClose={() => setPublishModalOpen(false)}
          actions={<button className="btn" onClick={() => setPublishModalOpen(false)}>Cerrar</button>}
        >
          {publishingProduct.ml_permalink && (
            <div style={{ marginBottom: 10 }}>
              <a href={publishingProduct.ml_permalink} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12 }}>
                Ver publicación ↗
              </a>
            </div>
          )}

          {mlError && <div className="auth-error" style={{ marginBottom: 10 }}>{mlError}</div>}

          {publishingProduct.ml_item_id ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className={'badge ' + (ML_STATUS_BADGE[publishingProduct.ml_status] || 'badge-neutral')}>
                {ML_STATUS_LABEL[publishingProduct.ml_status] || publishingProduct.ml_status}
              </span>
              {publishingProduct.ml_status !== 'closed' && (
                <>
                  {publishingProduct.ml_status === 'active' ? (
                    <button type="button" className="btn" disabled={mlBusy} onClick={() => changeMlStatus('paused')}>Pausar</button>
                  ) : (
                    <button type="button" className="btn" disabled={mlBusy} onClick={() => changeMlStatus('active')}>Reactivar</button>
                  )}
                  <button type="button" className="btn btn-ghost btn-danger" disabled={mlBusy} onClick={() => changeMlStatus('closed')}>
                    Finalizar
                  </button>
                </>
              )}
            </div>
          ) : !selectedCategory ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Elegí la categoría navegando (el buscador de Mercado Libre está bloqueado para esta cuenta, así que recorremos el árbol de categorías).
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={browseHome}>Inicio</button>
                {browseStack.map((n, i) => (
                  <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--text-dim)' }}>›</span>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={() => browseBackTo(i)}>{n.name}</button>
                  </span>
                ))}
              </div>
              {browseLoading ? (
                <div className="empty-state" style={{ padding: 12 }}>Cargando…</div>
              ) : browseNode ? (
                <>
                  <div style={{ fontWeight: 700 }}>{browseNode.name}</div>
                  {browseNode.listing_allowed && (
                    <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={mlBusy} onClick={selectCategory}>
                      Publicar en "{browseNode.name}"
                    </button>
                  )}
                  {browseNode.children.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                      {browseNode.children.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          className="btn"
                          style={{ justifyContent: 'flex-start' }}
                          onClick={() => browseInto(c)}
                        >
                          {c.name} →
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-orange">{selectedCategory.category_name}</span>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={clearSelectedCategory}>Cambiar categoría</button>
              </div>
              {categoryAttrs.map((a) => (
                <div className="field" key={a.id}>
                  <label>{a.name} *</label>
                  {a.values.length > 0 ? (
                    <select className="input" value={attrValues[a.id] || ''} onChange={(e) => setAttrValues({ ...attrValues, [a.id]: e.target.value })}>
                      <option value="">Elegir…</option>
                      {a.values.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={attrValues[a.id] || ''} onChange={(e) => setAttrValues({ ...attrValues, [a.id]: e.target.value })} />
                  )}
                </div>
              ))}
              <div className="field">
                <label>Condición</label>
                <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="new">Nuevo</option>
                  <option value="used">Usado</option>
                </select>
              </div>
              {publishingPhotos.length === 0 && (
                <div className="auth-error" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Subí al menos una foto antes de publicar.</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => { setPublishModalOpen(false); openEdit(publishingProduct) }}
                  >
                    Ir a Editar →
                  </button>
                </div>
              )}
              <button type="button" className="btn btn-primary" disabled={mlBusy || publishingPhotos.length === 0} onClick={publishToMl}>
                {mlBusy ? 'Publicando…' : 'Publicar en Mercado Libre'}
              </button>
            </div>
          )}

          {publishingProduct.ml_item_id && (
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Reseñas</label>
              {reviews === null ? (
                <div className="empty-state" style={{ padding: 12 }}>Cargando…</div>
              ) : reviews.reviews_total === 0 ? (
                <div className="empty-state" style={{ padding: 12 }}>Todavía no tiene reseñas.</div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    ★ {reviews.rating_average.toFixed(1)} ({reviews.reviews_total})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                    {reviews.reviews.map((r) => (
                      <div key={r.id} style={{ fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                        <div style={{ fontWeight: 600 }}>{'★'.repeat(r.rate)}{'☆'.repeat(5 - r.rate)}</div>
                        {r.comment && <div style={{ color: 'var(--text-dim)' }}>{r.comment}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
