import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'

// Tabla de categorías vigente desde agosto 2026 (RG ARCA, ajuste +16,85%).
// Fuente: publicación oficial de escalas de monotributo. Verificar en arca.gob.ar
// antes de recategorizarte o pagar: estos valores se actualizan cada semestre (enero y julio).
const MONOTRIBUTO_TABLE = [
  { cat: 'A', limit: 12009410.45, fee: 49527.18 },
  { cat: 'B', limit: 17595182.74, fee: 56379.08 },
  { cat: 'C', limit: 24670494.31, fee: 64530.58 },
  { cat: 'D', limit: 30628651.43, fee: 82564.81 },
  { cat: 'E', limit: 36028231.33, fee: 108267.51 },
  { cat: 'F', limit: 45151659.41, fee: 129930.65 },
  { cat: 'G', limit: 53995798.87, fee: 158815.05 },
  { cat: 'H', limit: 81924660.37, fee: 317895.01 },
  { cat: 'I', limit: 91699761.90, fee: 474992.78 },
  { cat: 'J', limit: 105012519.20, fee: 580793.69 },
  { cat: 'K', limit: 126610838.75, fee: 702103.24 },
]

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

const MONTH_LABEL = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })

export default function Monotributo() {
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revenue12m, setRevenue12m] = useState(0)
  const [paidThisMonth, setPaidThisMonth] = useState(false)
  const [registering, setRegistering] = useState(false)

  async function loadAll() {
    setLoading(true)
    const { data: settingsRows } = await supabase.from('settings').select('*').eq('key', 'monotributo_category')
    setCategory(settingsRows?.[0]?.value || '')

    const from = new Date()
    from.setMonth(from.getMonth() - 12)
    const { data: entries } = await supabase
      .from('accounting_entries')
      .select('amount')
      .eq('type', 'income')
      .eq('category', 'ventas')
      .gte('entry_date', ymd(from))
    setRevenue12m((entries || []).reduce((sum, e) => sum + Number(e.amount), 0))

    const monthStart = new Date()
    monthStart.setDate(1)
    const { data: paidRows } = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('type', 'expense')
      .eq('category', 'monotributo')
      .gte('entry_date', ymd(monthStart))
    setPaidThisMonth((paidRows || []).length > 0)

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function saveCategory(newCat) {
    setCategory(newCat)
    setSaving(true)
    await supabase.from('settings').upsert([{ key: 'monotributo_category', value: newCat }])
    setSaving(false)
  }

  async function registerPayment() {
    if (!current) return
    setRegistering(true)
    const today = new Date()
    await supabase.from('accounting_entries').insert({
      type: 'expense',
      category: 'monotributo',
      amount: current.fee,
      description: `Cuota monotributo categoría ${category} - ${MONTH_LABEL.format(today)}`,
      entry_date: ymd(today),
    })
    setRegistering(false)
    loadAll()
  }

  const current = MONOTRIBUTO_TABLE.find((c) => c.cat === category) || null
  const suggested = MONOTRIBUTO_TABLE.find((c) => revenue12m <= c.limit) || MONOTRIBUTO_TABLE[MONOTRIBUTO_TABLE.length - 1]
  const pctUsed = current ? Math.min(100, (revenue12m / current.limit) * 100) : 0
  const overLimit = current && revenue12m > current.limit

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Monotributo</h1>
          <p>Seguimiento de categoría y facturación ante ARCA (ex AFIP)</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Facturación últimos 12 meses</div>
          <div className="stat-value">{loading ? '…' : formatMoney(revenue12m)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tu categoría</div>
          <div className="stat-value">{category || '— sin definir'}</div>
        </div>
        {current && (
          <div className="stat-card">
            <div className="stat-label">Cuota mensual ({category})</div>
            <div className="stat-value">{formatMoney(current.fee)}</div>
            {!loading && (
              paidThisMonth ? (
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-green">Registrada este mes</span>
                </div>
              ) : (
                <button className="btn btn-primary" style={{ marginTop: 8, fontSize: 12 }} disabled={registering} onClick={registerPayment}>
                  {registering ? 'Registrando…' : 'Registrar pago del mes en Contabilidad'}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {!loading && overLimit && (
        <div className="auth-error" style={{ marginBottom: 16 }}>
          Tu facturación de los últimos 12 meses ({formatMoney(revenue12m)}) superó el límite de la categoría {category}
          ({formatMoney(current.limit)}). Te correspondería recategorizarte a <strong>{suggested.cat}</strong>.
          La recategorización se hace en enero y julio en arca.gob.ar con Clave Fiscal.
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Elegí tu categoría actual</label>
          {saving && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Guardando…</span>}
        </div>
        <select className="input" style={{ maxWidth: 200 }} value={category} onChange={(e) => saveCategory(e.target.value)}>
          <option value="">Sin definir</option>
          {MONOTRIBUTO_TABLE.map((c) => (
            <option key={c.cat} value={c.cat}>Categoría {c.cat}</option>
          ))}
        </select>

        {current && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
              <span>{pctUsed.toFixed(0)}% del límite anual usado</span>
              <span>{formatMoney(revenue12m)} / {formatMoney(current.limit)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pctUsed}%`,
                  background: overLimit ? 'var(--danger)' : pctUsed > 80 ? 'var(--warning, orange)' : 'var(--success, green)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Límite facturación anual</th>
              <th>Cuota mensual</th>
            </tr>
          </thead>
          <tbody>
            {MONOTRIBUTO_TABLE.map((c) => (
              <tr key={c.cat} style={c.cat === category ? { background: 'var(--surface-2)' } : undefined}>
                <td style={{ fontWeight: 600 }}>{c.cat}</td>
                <td>{formatMoney(c.limit)}</td>
                <td>{formatMoney(c.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
        Tabla vigente desde agosto 2026 para venta de bienes muebles (RG ARCA, ajuste +16,85%). Se actualiza cada semestre
        (enero y julio) — verificá los montos oficiales en arca.gob.ar antes de pagar o recategorizarte. La facturación de
        arriba se calcula con los movimientos cargados en Contabilidad (categoría "ventas"), no incluye lo que hayas
        facturado antes de usar esta app.
      </p>
    </div>
  )
}
