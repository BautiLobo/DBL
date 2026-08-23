import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Logo from './Logo'

const NAV = [
  { to: '/', label: 'Panel', end: true },
  { to: '/inventario', label: 'Inventario' },
  { to: '/pedidos', label: 'Pedidos' },
  { to: '/contabilidad', label: 'Contabilidad' },
  { to: '/estadisticas', label: 'Estadísticas' },
  { to: '/configuracion', label: 'Configuración' },
]

export default function Layout() {
  const { signOut, session } = useAuth()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={30} />
          <div>
            <div className="brand-name">DBL Repuestos</div>
            <div className="brand-sub">Gestión de inventario</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
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

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
