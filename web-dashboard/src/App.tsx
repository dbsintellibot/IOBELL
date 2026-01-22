import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { QueryProvider } from '@/providers/QueryProvider'
import Login from '@/pages/Login'
import DashboardLayout from '@/layout/DashboardLayout'
import Overview from '@/pages/Overview'
import BellManagement from '@/pages/BellManagement'
import ProfileEditor from '@/pages/ProfileEditor'
import AudioManager from '@/pages/AudioManager'
import { ProtectedRoute } from '@/components/ProtectedRoute'

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Overview />} />
                <Route path="bells" element={<BellManagement />} />
                <Route path="profiles" element={<ProfileEditor />} />
                <Route path="audio" element={<AudioManager />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryProvider>
  )
}

export default App
