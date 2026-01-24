import { useAuth } from '@/hooks/useAuth'
import { Navigate } from 'react-router-dom'

export function IndexRedirect() {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role === 'super_admin') {
    return <Navigate to="/super-admin" replace />
  }

  return <Navigate to="/dashboard" replace />
}
