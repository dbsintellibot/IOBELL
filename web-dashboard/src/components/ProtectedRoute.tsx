import { useAuth } from '@/context/AuthContext'
import { Navigate, Outlet } from 'react-router-dom'

interface ProtectedRouteProps {
  requiredRole?: 'super_admin' | 'admin' | 'operator'
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
    // If user is logged in but doesn't have the required role
    // For super_admin routes, redirect to dashboard if they are admin/operator
    // For dashboard routes, if they are super_admin, maybe redirect to super-admin dashboard
    if (role === 'super_admin') {
      return <Navigate to="/super-admin" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
