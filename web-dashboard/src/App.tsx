import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Login from '@/pages/Login'
import DashboardLayout from '@/layout/DashboardLayout'
import Overview from '@/pages/Overview'
import BellManagement from '@/pages/BellManagement'
import ProfileEditor from '@/pages/ProfileEditor'
import PeriodBellsAndAnnouncements from '@/pages/PeriodBellsAndAnnouncements'
import AudioManager from '@/pages/AudioManager'
import SchoolSettings from '@/pages/SchoolSettings'
import SchoolBackups from '@/pages/SchoolBackups'
import Broadcast from '@/pages/Broadcast'
import ReportsManager from '@/pages/ReportsManager'
import TicketManagement from '@/pages/TicketManagement'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import SuperAdminLayout from '@/layout/SuperAdminLayout'
import SuperAdminOverview from '@/pages/super-admin/Overview'
import SchoolManagement from '@/pages/super-admin/SchoolManagement'
import UserManagement from '@/pages/super-admin/UserManagement'
import InventoryManagement from '@/pages/super-admin/InventoryManagement'
import SuperAdminBackups from '@/pages/super-admin/Backups'
import PartnerManagement from '@/pages/super-admin/PartnerManagement'
import NotificationManagement from '@/pages/super-admin/NotificationManagement'
import PreAnnouncementManagement from '@/pages/super-admin/PreAnnouncementManagement'
import HealthDashboard from '@/pages/super-admin/HealthDashboard'
import { IndexRedirect } from '@/components/IndexRedirect'

import PartnerLayout from '@/layout/PartnerLayout'
import PartnerOverview from '@/pages/partner/Overview'
import PartnerLeads from '@/pages/partner/Leads'
import PartnerDeals from '@/pages/partner/Deals'
import PartnerPayments from '@/pages/partner/Payments'
import PartnerCommissions from '@/pages/partner/Commissions'
import PartnerSettings from '@/pages/partner/Settings'

function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <ImpersonationBanner />
              <Routes>
                <Route path="/login" element={<Login />} />
              
                {/* Partner Routes */}
                <Route element={<ProtectedRoute requiredRole="partner" />}>
                  <Route path="/partner" element={<PartnerLayout />}>
                    <Route index element={<PartnerOverview />} />
                    <Route path="leads" element={<PartnerLeads />} />
                    <Route path="deals" element={<PartnerDeals />} />
                    <Route path="payments" element={<PartnerPayments />} />
                    <Route path="commissions" element={<PartnerCommissions />} />
                    <Route path="settings" element={<PartnerSettings />} />
                  </Route>
                </Route>

                {/* Super Admin Routes */}
                <Route element={<ProtectedRoute requiredRole="super_admin" />}>
                  <Route path="/super-admin" element={<SuperAdminLayout />}>
                    <Route index element={<SuperAdminOverview />} />
                    <Route path="schools" element={<SchoolManagement />} />
                    <Route path="users" element={<UserManagement />} />
                    <Route path="partners" element={<PartnerManagement />} />
                    <Route path="notifications" element={<NotificationManagement />} />
                    <Route path="pre-announcements" element={<PreAnnouncementManagement />} />
                    <Route path="inventory" element={<InventoryManagement />} />
                    <Route path="backups" element={<SuperAdminBackups />} />
                    <Route path="health" element={<HealthDashboard />} />
                    <Route path="tickets" element={<TicketManagement />} />
                    <Route path="reports" element={<ReportsManager />} />
                  </Route>
                </Route>

                {/* School Admin / Operator Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<Overview />} />
                    <Route path="bells" element={<BellManagement />} />
                    <Route path="profiles" element={<ProfileEditor />} />
                    <Route path="bells-and-announcements" element={<PeriodBellsAndAnnouncements />} />
                    <Route path="audio" element={<AudioManager />} />
                    <Route path="broadcast" element={<Broadcast />} />
                    <Route path="reports" element={<ReportsManager />} />
                    <Route path="tickets" element={<TicketManagement />} />
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
    </ErrorBoundary>
  )
}

export default App
