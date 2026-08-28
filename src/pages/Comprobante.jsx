import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatMoney, formatDate } from '../lib/format'

export default function Comprobante() {
  const { saleId } = useParams()
  const [sale, setSale] = useState(null)
  const [businessName, setBusinessName] = useState('DBL Repuestos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sales')
        .select('*, sale_items(*, products(title, sku)), customers(name, phone, email, address)')
        .eq('id', saleId)
        .single()
      setSale(data)

      const { data: settingsRows } = await supabase.from('settings').select('*').eq('key', 'business_name')
      if (settingsRows?.[0]?.value) setBusinessName(settingsRows[0].value)

      setLoading(false)
    }
    load()
  }, [saleId])

  if (loading) return <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Cargando…</div>
  if (!sale) return <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Pedido no encontrado.</div>

  const items = sale.sale_items || []

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 32, fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontWeight: 600 }}
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      <div style={{ borderBottom: '2px solid #1a1a1a', paddingBottom: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{businessName}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Comprobante de venta</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div>N.º {String(sale.id).padStart(6, '0')}</div>
          <div>{formatDate(sale.sale_date || sale.created_at)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontSize: 13.5 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Cliente</div>
        <div>{sale.buyer_name || sale.customers?.name || 'Consumidor final'}</div>
        {sale.customers?.phone && <div>{sale.customers.phone}</div>}
        {sale.customers?.email && <div>{sale.customers.email}</div>}
        {sale.customers?.address && <div>{sale.customers.address}</div>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
            <th style={{ textAlign: 'left', padding: '6px 4px' }}>Producto</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Cant.</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Precio unit.</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
              <td style={{ padding: '6px 4px' }}>{it.products?.title || '—'}{it.products?.sku ? ` (${it.products.sku})` : ''}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>{it.qty}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>{formatMoney(it.unit_price)}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>{formatMoney(it.qty * it.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 30 }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, borderTop: '2px solid #1a1a1a', paddingTop: 8 }}>
            <span>Total</span>
            <span>{formatMoney(sale.total_amount)}</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#888', borderTop: '1px solid #e5e5e5', paddingTop: 12 }}>
        Este comprobante es un recibo interno y no reemplaza a una factura fiscal emitida por AFIP/ARCA.
      </div>
    </div>
  )
}
