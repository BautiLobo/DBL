import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import MaterialesEnvio from './pages/MaterialesEnvio'
import Proveedores from './pages/Proveedores'
import Pedidos from './pages/Pedidos'
import Preguntas from './pages/Preguntas'
import Reclamos from './pages/Reclamos'
import Contabilidad from './pages/Contabilidad'
import Monotributo from './pages/Monotributo'
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
        <Route path="/materiales-envio" element={<MaterialesEnvio />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/preguntas" element={<Preguntas />} />
        <Route path="/reclamos" element={<Reclamos />} />
        <Route path="/contabilidad" element={<Contabilidad />} />
        <Route path="/monotributo" element={<Monotributo />} />
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
