import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Configuracion() {
  const [settings, setSettings] = useState({ business_name: '', default_min_stock_alert: '2' })
  const [savingSettings, setSavingSettings] = useState(false)
  const [mlStatus, setMlStatus] = useState(null) // null = cargando
  const [banner, setBanner] = useState(null)

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
  }, [])

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
    </div>
  )
}
