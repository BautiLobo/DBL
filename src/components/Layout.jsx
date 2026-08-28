import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import Logo from './Logo'

const NAV = [
  { to: '/', label: 'Panel', icon: '🏠', end: true },
  { to: '/inventario', label: 'Inventario', icon: '📦' },
  { to: '/materiales-envio', label: 'Materiales de envío', icon: '📮' },
  { to: '/proveedores', label: 'Proveedores', icon: '🤝' },
  { to: '/pedidos', label: 'Pedidos', icon: '🛒' },
  { to: '/preguntas', label: 'Preguntas', icon: '❓' },
  { to: '/reclamos', label: 'Reclamos', icon: '⚠️' },
  { to: '/contabilidad', label: 'Contabilidad', icon: '💰' },
  { to: '/monotributo', label: 'Monotributo', icon: '🧾' },
  { to: '/estadisticas', label: 'Estadísticas', icon: '📈' },
  { to: '/configuracion', label: 'Configuración', icon: '⚙️' },
]

export default function Layout() {
  const { signOut, session } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <div className="brand">
          <Logo size={26} />
          <div className="brand-name">DBL Repuestos</div>
        </div>
        <button
          className="menu-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <div className="brand">
          <Logo size={30} />
          <div>
            <div className="brand-name">DBL Repuestos</div>
            <div className="brand-sub">Gestión de inventario</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '0 12px 6px' }}>
            {session?.user?.email}
          </div>
          <button className="logout-btn" onClick={() => signOut()}>Cerrar sesión</button>
        </div>
      </aside>

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
