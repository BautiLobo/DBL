import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import Pedidos from './pages/Pedidos'
import Contabilidad from './pages/Contabilidad'
import Estadisticas from './pages/Estadisticas'
import Configuracion from './pages/Configuracion'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="auth-shell">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

function Routed() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={loading ? null : session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/contabilidad" element={<Contabilidad />} />
        <Route path="/estadisticas" element={<Estadisticas />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AuthProvider>
  )
}
