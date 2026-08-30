import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatMoney, formatDate, formatInvoiceNumber } from '../lib/format'

const FISCAL_KEYS = [
  'business_name',
  'fiscal_cuit',
  'fiscal_razon_social',
  'fiscal_domicilio',
  'fiscal_condicion_iva',
  'fiscal_punto_venta',
  'fiscal_iibb',
  'fiscal_inicio_actividades',
]

export default function Comprobante() {
  const { saleId } = useParams()
  const [sale, setSale] = useState(null)
  const [fiscal, setFiscal] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sales')
        .select('*, sale_items(*, products(title, sku)), customers(name, phone, email, address)')
        .eq('id', saleId)
        .single()
      setSale(data)

      const { data: settingsRows } = await supabase.from('settings').select('*').in('key', FISCAL_KEYS)
      const map = {}
      for (const row of settingsRows || []) map[row.key] = row.value
      setFiscal(map)

      setLoading(false)
    }
    load()
  }, [saleId])

  if (loading) return <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Cargando…</div>
  if (!sale) return <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Pedido no encontrado.</div>

  const items = sale.sale_items || []
  const businessName = fiscal.business_name || 'DBL Repuestos'
  const razonSocial = fiscal.fiscal_razon_social || businessName
  const hasCae = false // no hay integración con AFIP/ARCA todavía: esto no reemplaza una factura electrónica con CAE

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 32, fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' }}>
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
          Imprimir / Descargar PDF
        </button>
      </div>

      <div style={{ border: '1px solid #1a1a1a', borderRadius: 4, padding: 16, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{razonSocial}</div>
          {businessName !== razonSocial && <div style={{ fontSize: 13, color: '#555' }}>{businessName}</div>}
          {fiscal.fiscal_domicilio && <div style={{ fontSize: 12.5, marginTop: 4 }}>{fiscal.fiscal_domicilio}</div>}
          <div style={{ fontSize: 12.5, marginTop: 6 }}>
            {fiscal.fiscal_cuit && <div>CUIT: {fiscal.fiscal_cuit}</div>}
            <div>Condición frente al IVA: {fiscal.fiscal_condicion_iva || 'Monotributista'}</div>
            {fiscal.fiscal_iibb && <div>Ingresos Brutos: {fiscal.fiscal_iibb}</div>}
            {fiscal.fiscal_inicio_actividades && <div>Inicio de actividades: {fiscal.fiscal_inicio_actividades}</div>}
          </div>
        </div>
        <div style={{ width: 1, background: '#1a1a1a' }} />
        <div style={{ width: 190, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, border: '2px solid #1a1a1a', borderRadius: 6, width: 48, margin: '0 auto', lineHeight: '46px' }}>C</div>
            <div style={{ fontSize: 10, marginTop: 2 }}>FACTURA</div>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 10 }}>
            <div>N.º {formatInvoiceNumber(fiscal.fiscal_punto_venta, sale.invoice_number)}</div>
            <div>{formatDate(sale.sale_date || sale.created_at)}</div>
          </div>
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

      {!hasCae && (
        <div style={{ fontSize: 11, color: '#888', borderTop: '1px solid #e5e5e5', paddingTop: 12 }}>
          Documento no válido como factura electrónica ante AFIP/ARCA (no posee CAE) — es un comprobante interno para
          adjuntar al envío. Se emitirá con CAE una vez conectada la facturación electrónica del monotributo.
        </div>
      )}
    </div>
  )
}
