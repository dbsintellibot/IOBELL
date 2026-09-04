import { useAuth } from '@/hooks/useAuth'
import { Navigate, Outlet } from 'react-router-dom'

interface ProtectedRouteProps {
  requiredRole?: 'super_admin' | 'admin' | 'operator' | 'partner'
}

export function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && role !== requiredRole) {
    if (role === 'super_admin') {
      return <Navigate to="/super-admin" replace />
    }
    if (role === 'partner') {
      return <Navigate to="/partner" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  if (!requiredRole && role === 'super_admin') {
    return <Navigate to="/super-admin" replace />
  }

  if (!requiredRole && role === 'partner') {
    return <Navigate to="/partner" replace />
  }

  return <Outlet />
}
