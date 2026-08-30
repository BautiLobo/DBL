import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { pushSupported, getCurrentSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push'

export default function Configuracion() {
  const [settings, setSettings] = useState({
    business_name: '',
    default_min_stock_alert: '2',
    fiscal_cuit: '',
    fiscal_razon_social: '',
    fiscal_domicilio: '',
    fiscal_condicion_iva: 'Monotributista',
    fiscal_punto_venta: '0001',
    fiscal_iibb: '',
    fiscal_inicio_actividades: '',
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [mlStatus, setMlStatus] = useState(null) // null = cargando
  const [banner, setBanner] = useState(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')
  const [testSent, setTestSent] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('ml_connected')) setBanner({ type: 'ok', text: 'Cuenta de Mercado Libre conectada correctamente.' })
    if (params.get('ml_error')) setBanner({ type: 'error', text: 'No se pudo conectar la cuenta de Mercado Libre. Probá de nuevo.' })
    if (params.toString()) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  useEffect(() => {
    supabase.from('settings').select('*').then(({ data }) => {
      const map = {}
      for (const row of data || []) map[row.key] = row.value
      setSettings((s) => ({ ...s, ...map }))
    })
    refreshMlStatus()
    if (pushSupported()) {
      getCurrentSubscription().then((sub) => setPushEnabled(!!sub)).catch(() => {})
    }
  }, [])

  async function handleTogglePush() {
    setPushBusy(true)
    setPushError('')
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        await subscribeToPush()
        setPushEnabled(true)
      }
    } catch (e) {
      setPushError(e.message)
    }
    setPushBusy(false)
  }

  async function sendTestPush() {
    setPushBusy(true)
    setPushError('')
    setTestSent(false)
    try {
      const res = await fetch('/api/push', { method: 'POST' })
      if (!res.ok) throw new Error('No se pudo enviar la notificación de prueba')
      setTestSent(true)
    } catch (e) {
      setPushError(e.message)
    }
    setPushBusy(false)
  }

  async function refreshMlStatus() {
    try {
      const res = await fetch('/api/ml/status')
      const data = await res.json()
      setMlStatus(data)
    } catch {
      setMlStatus({ connected: false })
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault()
    setSavingSettings(true)
    await supabase.from('settings').upsert([
      { key: 'business_name', value: settings.business_name },
      { key: 'default_min_stock_alert', value: String(settings.default_min_stock_alert) },
      { key: 'fiscal_cuit', value: settings.fiscal_cuit },
      { key: 'fiscal_razon_social', value: settings.fiscal_razon_social },
      { key: 'fiscal_domicilio', value: settings.fiscal_domicilio },
      { key: 'fiscal_condicion_iva', value: settings.fiscal_condicion_iva },
      { key: 'fiscal_punto_venta', value: settings.fiscal_punto_venta },
      { key: 'fiscal_iibb', value: settings.fiscal_iibb },
      { key: 'fiscal_inicio_actividades', value: settings.fiscal_inicio_actividades },
    ])
    setSavingSettings(false)
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar la cuenta de Mercado Libre?')) return
    await fetch('/api/ml/disconnect', { method: 'POST' })
    refreshMlStatus()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p>Datos del negocio y conexión con Mercado Libre</p>
        </div>
      </div>

      {banner && (
        <div className={banner.type === 'ok' ? 'auth-error' : 'auth-error'} style={{
          marginBottom: 16,
          background: banner.type === 'ok' ? 'var(--green-soft)' : 'var(--danger-soft)',
          color: banner.type === 'ok' ? 'var(--green-h)' : 'var(--danger)',
        }}>
          {banner.text}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Mercado Libre</h2>
        <p style={{ marginTop: 6, marginBottom: 14 }}>
          Conectá tu cuenta para recibir pedidos automáticamente y ver métricas de tus publicaciones.
        </p>

        {mlStatus === null ? (
          <div className="empty-state">Verificando conexión…</div>
        ) : mlStatus.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="badge badge-green">Conectado</span>
            {mlStatus.whoami ? (
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                <strong style={{ color: 'var(--text-h)' }}>{mlStatus.whoami.nickname}</strong>
                {mlStatus.whoami.first_name && ` — ${mlStatus.whoami.first_name} ${mlStatus.whoami.last_name || ''}`}
                {mlStatus.whoami.seller_reputation?.level_id && ` · Reputación: ${mlStatus.whoami.seller_reputation.level_id}`}
              </span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Usuario ML #{mlStatus.ml_user_id}</span>
            )}
            {mlStatus.whoami?.permalink && (
              <a href={mlStatus.whoami.permalink} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12 }}>
                Ver perfil ↗
              </a>
            )}
            <button className="btn btn-ghost btn-danger" onClick={handleDisconnect}>Desconectar</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="badge badge-neutral">No conectado</span>
            <a className="btn btn-primary" href="/api/ml/auth">Conectar con Mercado Libre</a>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Notificaciones</h2>
        <p style={{ marginTop: 6, marginBottom: 14 }}>
          Recibí un aviso en este dispositivo cuando entre una venta o una pregunta nueva de Mercado Libre, sin tener que
          tener la app abierta.
        </p>
        {!pushSupported() ? (
          <div className="empty-state">Tu navegador no soporta notificaciones push.</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={'badge ' + (pushEnabled ? 'badge-green' : 'badge-neutral')}>
              {pushEnabled ? 'Activadas' : 'Desactivadas'}
            </span>
            <button className="btn btn-primary" disabled={pushBusy} onClick={handleTogglePush}>
              {pushBusy ? 'Procesando…' : pushEnabled ? 'Desactivar' : '🔔 Activar notificaciones'}
            </button>
            {pushEnabled && (
              <button className="btn" disabled={pushBusy} onClick={sendTestPush}>
                Enviar notificación de prueba
              </button>
            )}
          </div>
        )}
        {testSent && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--green)' }}>Enviada — debería aparecerte en unos segundos.</div>}
        {pushError && <div className="auth-error" style={{ marginTop: 10 }}>{pushError}</div>}
      </div>

      <div className="card">
        <h2>Negocio</h2>
        <form className="form-grid" onSubmit={handleSaveSettings} style={{ marginTop: 14 }}>
          <div className="field span-2">
            <label>Nombre del negocio</label>
            <input
              className="input"
              value={settings.business_name}
              onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Alerta de stock mínimo por defecto</label>
            <input
              className="input"
              type="number"
              value={settings.default_min_stock_alert}
              onChange={(e) => setSettings({ ...settings, default_min_stock_alert: e.target.value })}
            />
          </div>
          <div className="span-2">
            <button className="btn btn-primary" type="submit" disabled={savingSettings}>
              {savingSettings ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Datos fiscales (Monotributo)</h2>
        <p style={{ marginTop: 6, marginBottom: 14 }}>
          Se usan para armar la factura que se genera con cada pedido. Completalos cuando tengas el monotributo dado de
          alta — mientras tanto la factura se genera igual, con los campos que falten en blanco.
        </p>
        <form className="form-grid" onSubmit={handleSaveSettings} style={{ marginTop: 14 }}>
          <div className="field span-2">
            <label>Razón social / nombre completo</label>
            <input
              className="input"
              value={settings.fiscal_razon_social}
              onChange={(e) => setSettings({ ...settings, fiscal_razon_social: e.target.value })}
            />
          </div>
          <div className="field">
            <label>CUIT</label>
            <input
              className="input"
              placeholder="20-12345678-9"
              value={settings.fiscal_cuit}
              onChange={(e) => setSettings({ ...settings, fiscal_cuit: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Condición frente al IVA</label>
            <input
              className="input"
              value={settings.fiscal_condicion_iva}
              onChange={(e) => setSettings({ ...settings, fiscal_condicion_iva: e.target.value })}
            />
          </div>
          <div className="field span-2">
            <label>Domicilio fiscal</label>
            <input
              className="input"
              value={settings.fiscal_domicilio}
              onChange={(e) => setSettings({ ...settings, fiscal_domicilio: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Punto de venta</label>
            <input
              className="input"
              placeholder="0001"
              value={settings.fiscal_punto_venta}
              onChange={(e) => setSettings({ ...settings, fiscal_punto_venta: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Ingresos brutos (opcional)</label>
            <input
              className="input"
              value={settings.fiscal_iibb}
              onChange={(e) => setSettings({ ...settings, fiscal_iibb: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Inicio de actividades (opcional)</label>
            <input
              className="input"
              placeholder="01/2026"
              value={settings.fiscal_inicio_actividades}
              onChange={(e) => setSettings({ ...settings, fiscal_inicio_actividades: e.target.value })}
            />
          </div>
          <div className="span-2">
            <button className="btn btn-primary" type="submit" disabled={savingSettings}>
              {savingSettings ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
