import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import Login from '@/pages/Login'
import DashboardLayout from '@/layout/DashboardLayout'
import Overview from '@/pages/Overview'
import BellManagement from '@/pages/BellManagement'
import ProfileEditor from '@/pages/ProfileEditor'
import AudioManager from '@/pages/AudioManager'
import SchoolSettings from '@/pages/SchoolSettings'
import SchoolBackups from '@/pages/SchoolBackups'
import Broadcast from '@/pages/Broadcast'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import SuperAdminLayout from '@/layout/SuperAdminLayout'
import SuperAdminOverview from '@/pages/super-admin/Overview'
import SchoolManagement from '@/pages/super-admin/SchoolManagement'
import UserManagement from '@/pages/super-admin/UserManagement'
import InventoryManagement from '@/pages/super-admin/InventoryManagement'
import SuperAdminBackups from '@/pages/super-admin/Backups'
import { IndexRedirect } from '@/components/IndexRedirect'

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Super Admin Routes */}
            <Route element={<ProtectedRoute requiredRole="super_admin" />}>
              <Route path="/super-admin" element={<SuperAdminLayout />}>
                <Route index element={<SuperAdminOverview />} />
                <Route path="schools" element={<SchoolManagement />} />
                <Route path="users" element={<UserManagement />} />
                <Route path="inventory" element={<InventoryManagement />} />
                <Route path="backups" element={<SuperAdminBackups />} />
              </Route>
            </Route>

            {/* School Admin / Operator Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Overview />} />
                <Route path="bells" element={<BellManagement />} />
                <Route path="profiles" element={<ProfileEditor />} />
                <Route path="audio" element={<AudioManager />} />
                <Route path="broadcast" element={<Broadcast />} />
                <Route path="settings" element={<SchoolSettings />} />
                <Route path="backups" element={<SchoolBackups />} />
              </Route>
            </Route>

            <Route path="/" element={<IndexRedirect />} />
          </Routes>
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  )
}

export default App
