import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

// Cuando se escanea un código que no está en ningún producto: permite asignárselo
// a un producto existente. onAssigned(product) recibe el producto ya con el código.
export default function AssignBarcode({ code, products, onAssigned, onClose }) {
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const q = search.toLowerCase()
  const candidates = products
    .filter((p) => !p.barcode)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    .slice(0, 30)

  async function assign(p) {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('products').update({ barcode: code }).eq('id', p.id)
    setSaving(false)
    if (err) {
      setError('No se pudo asignar: ' + err.message)
      return
    }
    onAssigned({ ...p, barcode: code })
  }

  return (
    <Modal
      title="Código no encontrado"
      onClose={onClose}
      actions={<button className="btn" onClick={onClose}>Cancelar</button>}
    >
      <p style={{ fontSize: 13.5, marginTop: 0 }}>
        El código <b>{code}</b> no está asignado a ningún producto. Elegí a cuál pertenece y queda guardado para la próxima.
        Si es un producto nuevo, crealo desde Inventario.
      </p>
      <input className="input" autoFocus placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxHeight: 320, overflowY: 'auto' }}>
        {candidates.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No hay productos sin código que coincidan.</div>
        ) : candidates.map((p) => (
          <button key={p.id} type="button" className="btn" disabled={saving} style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => assign(p)}>
            {p.title}{p.sku ? <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 6 }}>{p.sku}</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  )
}
