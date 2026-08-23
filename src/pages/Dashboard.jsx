import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'

export default function Dashboard() {
  const [lowStock, setLowStock] = useState([])
  const [todaySales, setTodaySales] = useState({ count: 0, total: 0 })
  const [pendingMl, setPendingMl] = useState(0)
  const [productCount, setProductCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)

      const [{ data: low }, { data: todays }, { count: pending }, { count: total }] = await Promise.all([
        supabase.from('low_stock_products').select('*').limit(10),
        supabase.from('sales').select('total_amount').eq('sale_date', today),
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('source', 'mercadolibre').eq('status', 'pending'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
      ])

      setLowStock(low || [])
      setTodaySales({
        count: (todays || []).length,
        total: (todays || []).reduce((s, r) => s + Number(r.total_amount), 0),
      })
      setPendingMl(pending || 0)
      setProductCount(total || 0)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Panel</h1>
          <p>Resumen general de DBL Repuestos</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Ventas de hoy</div>
          <div className="stat-value green">{loading ? '—' : formatMoney(todaySales.total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pedidos hoy</div>
          <div className="stat-value">{loading ? '—' : todaySales.count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pedidos ML pendientes</div>
          <div className="stat-value accent">{loading ? '—' : pendingMl}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Productos activos</div>
          <div className="stat-value">{loading ? '—' : productCount}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2>Alertas de stock bajo</h2>
          <Link to="/inventario" className="btn btn-ghost" style={{ fontSize: 13 }}>Ver inventario →</Link>
        </div>
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : lowStock.length === 0 ? (
          <div className="empty-state">Todo el stock está en niveles saludables. 👍</div>
        ) : (
          <table className="table">
            <thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th></tr></thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.title}</td>
                  <td><span className="badge badge-danger">{p.stock_qty}</span></td>
                  <td>{p.min_stock_alert}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
