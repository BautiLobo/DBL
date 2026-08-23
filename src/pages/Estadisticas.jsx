import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'

function cssVar(name) {
  if (typeof window === 'undefined') return '#000'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export default function Estadisticas() {
  const [metrics, setMetrics] = useState([])
  const [products, setProducts] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [colors, setColors] = useState({ sales: '#16a34a', questions: '#2563eb', visits: '#ea580c', grid: '#e8ddd0' })

  useEffect(() => {
    setColors({
      sales: cssVar('--chart-sales'),
      questions: cssVar('--chart-questions'),
      visits: cssVar('--chart-visits'),
      grid: cssVar('--chart-grid'),
    })
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const since = new Date()
      since.setDate(since.getDate() - 30)

      const [{ data: m }, { data: p }, { data: si }] = await Promise.all([
        supabase.from('ml_item_metrics').select('*').gte('metric_date', since.toISOString().slice(0, 10)),
        supabase.from('products').select('id, title, ml_item_id').eq('active', true),
        supabase.from('sale_items').select('product_id, qty'),
      ])
      setMetrics(m || [])
      setProducts(p || [])
      setSaleItems(si || [])
      setLoading(false)
    }
    load()
  }, [])

  const trend = useMemo(() => {
    const byDate = {}
    for (const row of metrics) {
      const d = row.metric_date
      if (!byDate[d]) byDate[d] = { date: d, visits: 0, sales: 0, questions: 0 }
      byDate[d].visits += row.visits || 0
      byDate[d].sales += row.sales || 0
      byDate[d].questions += row.questions || 0
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  }, [metrics])

  const ranking = useMemo(() => {
    const soldByProduct = {}
    for (const si of saleItems) {
      soldByProduct[si.product_id] = (soldByProduct[si.product_id] || 0) + si.qty
    }
    const metricsByProduct = {}
    for (const m of metrics) {
      if (!metricsByProduct[m.product_id]) metricsByProduct[m.product_id] = { visits: 0, questions: 0 }
      metricsByProduct[m.product_id].visits += m.visits || 0
      metricsByProduct[m.product_id].questions += m.questions || 0
    }

    return products
      .map((p) => {
        const sold = soldByProduct[p.id] || 0
        const mv = metricsByProduct[p.id]?.visits || 0
        const mq = metricsByProduct[p.id]?.questions || 0
        return {
          id: p.id,
          title: p.title,
          connected: Boolean(p.ml_item_id),
          sold,
          visits: mv,
          questions: mq,
          conversion: mv > 0 ? (sold / mv) * 100 : null,
        }
      })
      .sort((a, b) => b.sold - a.sold || b.visits - a.visits)
  }, [products, saleItems, metrics])

  const hasMetrics = metrics.length > 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Estadísticas</h1>
          <p>Visitas, ventas y preguntas por producto (Mercado Libre)</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Tendencia — últimos 30 días</h2>
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : !hasMetrics ? (
          <div className="empty-state">
            Todavía no hay métricas de Mercado Libre sincronizadas. Conectá tu cuenta en
            Configuración para empezar a ver visitas y preguntas acá.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} fontSize={12} stroke={colors.grid} />
              <YAxis fontSize={12} stroke={colors.grid} allowDecimals={false} />
              <Tooltip labelFormatter={(d) => formatDate(d)} />
              <Legend />
              <Line type="monotone" dataKey="sales" name="Ventas" stroke={colors.sales} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="questions" name="Preguntas" stroke={colors.questions} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="visits" name="Visitas" stroke={colors.visits} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2>Ranking por producto</h2>
        <div className="table-wrap" style={{ border: 'none', marginTop: 10 }}>
          {products.length === 0 ? (
            <div className="empty-state">Cargá productos en Inventario para ver el ranking.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Vendidos</th>
                  <th>Visitas</th>
                  <th>Preguntas</th>
                  <th>Conversión</th>
                  <th>ML</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{r.title}</td>
                    <td>{r.sold}</td>
                    <td>{r.visits || '—'}</td>
                    <td>{r.questions || '—'}</td>
                    <td>{r.conversion !== null ? `${r.conversion.toFixed(1)}%` : '—'}</td>
                    <td>
                      <span className={'badge ' + (r.connected ? 'badge-green' : 'badge-neutral')}>
                        {r.connected ? 'Conectado' : 'Sin vincular'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
