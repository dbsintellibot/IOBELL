import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Building, Mail, Lock, MapPin, Wifi, WifiOff, Search, Settings, X, ChevronLeft, ChevronRight, LogIn } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

const ONLINE_TIMEOUT_MS = 5 * 60 * 1000

type School = {
  id: string
  name: string
  campus_name: string | null
  address: string | null
  payment_status: string | null
  max_devices: number | null
  created_at: string
  logo_url: string | null
  users: { email: string }[]
  is_online: boolean
  is_suspended: boolean
}

export default function SchoolManagement() {
  const queryClient = useQueryClient()
  const { impersonateSchool } = useAuth()
  const navigate = useNavigate()
  
  // Form State
  const [formData, setFormData] = useState({
    schoolName: '',
    campusName: '',
    address: '',
    email: '',
    password: ''
  })
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Search, Filter, and Pagination State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Edit Modal State
  const [editingSchool, setEditingSchool] = useState<School | null>(null)
  const [editFormData, setEditFormData] = useState({
    name: '',
    campus_name: '',
    address: '',
    max_devices: 10,
    payment_status: 'due',
    is_suspended: false
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const { data: schools = [] } = useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      const [schoolsResponse, devicesResponse] = await Promise.all([
        supabase
          .from('schools')
          .select('id, name, campus_name, address, payment_status, max_devices, created_at, logo_url, is_suspended, users(email)')
          .order('created_at', { ascending: false }),
        supabase
          .from('bell_devices')
          .select('school_id, status, last_heartbeat')
      ])

      const schoolData = schoolsResponse.data
      const schoolError = schoolsResponse.error
      if (schoolError || !schoolData) return []

      const deviceData = devicesResponse.data || []
      const now = Date.now()
      const onlineMap = new Map<string, boolean>()

      deviceData.forEach((device) => {
        const schoolId = (device as { school_id: string | null }).school_id
        if (!schoolId) return
        const status = (device as { status: string | null }).status
        const lastHeartbeat = (device as { last_heartbeat: string | null }).last_heartbeat
        const isOnlineByStatus = status === 'online'
        const isOnlineByHeartbeat =
          lastHeartbeat != null ? now - new Date(lastHeartbeat).getTime() <= ONLINE_TIMEOUT_MS : false
        if (isOnlineByStatus || isOnlineByHeartbeat) {
          onlineMap.set(schoolId, true)
        }
      })

      return schoolData.map((school) => {
        const typed = school as unknown as {
          id: string
          name: string
          campus_name: string | null
          address: string | null
          payment_status: string | null
          max_devices: number | null
          created_at: string
          logo_url?: string | null
          is_suspended: boolean | null
          users: { email: string }[]
        }
        return {
          id: typed.id,
          name: typed.name,
          campus_name: typed.campus_name,
          address: typed.address,
          payment_status: typed.payment_status,
          max_devices: typed.max_devices,
          created_at: typed.created_at,
          logo_url: typed.logo_url ?? null,
          users: typed.users,
          is_online: onlineMap.get(typed.id) ?? false,
          is_suspended: typed.is_suspended ?? false
        } as School
      })
    }
  })

  const handleOpenEditModal = (school: School) => {
    setEditingSchool(school)
    setEditFormData({
      name: school.name,
      campus_name: school.campus_name || '',
      address: school.address || '',
      max_devices: school.max_devices || 10,
      payment_status: school.payment_status || 'due',
      is_suspended: school.is_suspended || false
    })
    setEditError(null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSchool) return

    if (editFormData.max_devices <= 0) {
      setEditError("Max devices must be a positive integer.")
      return
    }

    setIsSaving(true)
    setEditError(null)

    try {
      const { error } = await supabase
        .from('schools')
        .update({
          name: editFormData.name,
          campus_name: editFormData.campus_name || null,
          address: editFormData.address || null,
          max_devices: editFormData.max_devices,
          payment_status: editFormData.payment_status,
          is_suspended: editFormData.is_suspended
        })
        .eq('id', editingSchool.id)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['schools'] })
      setEditingSchool(null)
      
      setNotification({ type: 'success', message: 'School settings updated successfully!' })
      setTimeout(() => setNotification(null), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error updating school'
      setEditError(message)
    } finally {
      setIsSaving(false)
    }
  }

  // Filter and Paginate
  const filteredSchools = schools.filter((school) => {
    const matchesSearch =
      school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (school.campus_name && school.campus_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (school.address && school.address.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !school.is_suspended) ||
      (statusFilter === 'suspended' && school.is_suspended)

    return matchesSearch && matchesStatus
  })

  const totalPages = Math.ceil(filteredSchools.length / itemsPerPage) || 1
  const paginatedSchools = filteredSchools.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('register_new_school', {
        school_name_input: formData.schoolName,
        campus_name_input: formData.campusName,
        address_input: formData.address,
        email_input: formData.email,
        password_input: formData.password
      })

      if (error) throw error
      if (data && !data.success) throw new Error(data.message)
      
      return data
    },
    onSuccess: () => {
      setFormData({
        schoolName: '',
        campusName: '',
        address: '',
        email: '',
        password: ''
      })
      queryClient.invalidateQueries({ queryKey: ['schools'] })
      setNotification({ type: 'success', message: 'School and Admin registered successfully!' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error registering school'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    registerMutation.mutate()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">School Management</h2>
      </div>

      {notification && (
        <div className={`p-4 rounded-md ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {/* Register New School Form */}
      <div className="rounded-lg bg-card text-foreground p-6 shadow border border-border">
        <h3 className="mb-4 text-lg font-medium text-foreground flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          Register New School & Admin
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* School Name */}
            <div>
              <label className="block text-sm font-medium text-foreground">School Name</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground">
                  <Building className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  name="schoolName"
                  required
                  className="flex-1 block w-full rounded-none rounded-r-md border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="Lincoln High School"
                  value={formData.schoolName}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Campus Name */}
            <div>
              <label className="block text-sm font-medium text-foreground">Campus Name</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground">
                  <Building className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  name="campusName"
                  className="flex-1 block w-full rounded-none rounded-r-md border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="Main Campus"
                  value={formData.campusName}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-foreground">Address</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  name="address"
                  className="flex-1 block w-full rounded-none rounded-r-md border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="123 Education Lane"
                  value={formData.address}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Admin Email */}
            <div>
              <label className="block text-sm font-medium text-foreground">Admin Email</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  name="email"
                  required
                  className="flex-1 block w-full rounded-none rounded-r-md border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="admin@school.edu"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Admin Password */}
            <div>
              <label className="block text-sm font-medium text-foreground">Admin Password</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  name="password"
                  required
                  className="flex-1 block w-full rounded-none rounded-r-md border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="********"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="inline-flex justify-center rounded-md border border-transparent bg-primary py-2 px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              {registerMutation.isPending ? 'Registering...' : 'Register School'}
            </button>
          </div>
        </form>
      </div>

      {/* Schools List */}
      <div className="rounded-lg bg-card text-foreground shadow overflow-hidden border border-border">
        {/* Toolbar with Search and Filtering */}
        <div className="px-4 py-4 sm:px-6 border-b border-border flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-muted/10">
          <h3 className="text-lg font-medium leading-6 text-foreground">Registered Schools</h3>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="Search name, campus, address..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/60 transition-colors"
              />
            </div>
            
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any)
                setCurrentPage(1)
              }}
              className="pl-3 pr-8 py-1.5 text-sm rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {/* School Items */}
        <ul className="divide-y divide-border">
          {paginatedSchools.length === 0 ? (
            <li className="px-4 py-12 text-center bg-card">
              <Building className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-base font-medium text-foreground">No schools found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search query or filters.</p>
            </li>
          ) : (
            paginatedSchools.map((school) => (
              <li key={school.id} className="px-4 py-4 sm:px-6 hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`relative flex h-11 w-11 items-center justify-center rounded-full ring-2 transition-all duration-300 ${
                        school.is_online
                          ? 'bg-emerald-500/10 ring-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] animate-pulse'
                          : 'bg-destructive/10 ring-destructive shadow-[0_0_0_1px_rgba(244,63,94,0.28)]'
                      }`}
                    >
                      {school.logo_url ? (
                        <img
                          src={school.logo_url}
                          alt={school.name}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className={`text-sm font-semibold ${
                            school.is_online ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive dark:text-red-400'
                          }`}
                        >
                          {school.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center">
                        <span
                          className={`absolute inline-flex h-3.5 w-3.5 rounded-full opacity-75 ${
                            school.is_online ? 'bg-emerald-400 animate-ping' : 'bg-rose-400 animate-ping'
                          }`}
                        />
                        <span
                          className={`relative inline-flex h-2 w-2 rounded-full border border-white ${
                            school.is_online ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-primary truncate">{school.name}</p>
                        {school.payment_status && (
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider ${
                            school.payment_status === 'paid' 
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : school.payment_status === 'trial'
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          }`}>
                            {school.payment_status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center mt-1 text-sm text-muted-foreground">
                        {school.campus_name && (
                          <span className="mr-4 flex items-center">
                            <Building className="mr-1.5 h-4 w-4 flex-shrink-0 text-muted-foreground/70" />
                            {school.campus_name}
                          </span>
                        )}
                        {school.address && (
                          <span className="flex items-center">
                            <MapPin className="mr-1.5 h-4 w-4 flex-shrink-0 text-muted-foreground/70" />
                            {school.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-sm text-foreground">
                        Admin: {school.users?.[0]?.email || 'None'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Devices limit: {school.max_devices}
                      </p>
                      <div className="flex items-center gap-2">
                        {school.is_suspended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive dark:text-red-400 ring-1 ring-destructive/20 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                            SUSPENDED
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ring-1 ${
                            school.is_online
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20'
                              : 'bg-destructive/10 text-destructive dark:text-red-400 ring-destructive/20'
                          }`}
                        >
                          {school.is_online ? (
                            <Wifi className="h-3 w-3" />
                          ) : (
                            <WifiOff className="h-3 w-3" />
                          )}
                          {school.is_online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        impersonateSchool(school.id)
                        navigate('/dashboard')
                      }}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-all"
                      title="Impersonate School Admin"
                    >
                      <LogIn className="h-5 w-5" />
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(school)}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-all"
                      title="Edit settings"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-4 py-4 sm:px-6 border-t border-border flex items-center justify-between bg-muted/20">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-card hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-card hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * itemsPerPage, filteredSchools.length)}
                  </span>{' '}
                  of <span className="font-medium">{filteredSchools.length}</span> schools
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const page = idx + 1;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors ${
                          currentPage === page
                            ? 'z-10 bg-primary border-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit School Settings Modal */}
      {editingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-xl bg-card text-foreground p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-border flex flex-col gap-6 scale-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Edit School Settings</h3>
              </div>
              <button 
                onClick={() => setEditingSchool(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20 text-sm">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-5">
              <div className="space-y-4">
                {/* School Profile Section */}
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">School Profile</h4>
                
                <div>
                  <label className="block text-sm font-medium text-foreground">School Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2"
                    placeholder="Lincoln High School"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">Campus Name</label>
                    <input
                      type="text"
                      value={editFormData.campus_name}
                      onChange={(e) => setEditFormData({ ...editFormData, campus_name: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2"
                      placeholder="Main Campus"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Address</label>
                    <input
                      type="text"
                      value={editFormData.address}
                      onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2"
                      placeholder="123 Education Lane"
                    />
                  </div>
                </div>

                <hr className="border-border/65 my-2" />

                {/* Tier & Configuration Section */}
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Tier & Operational Settings</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">Max Devices Limit</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editFormData.max_devices}
                      onChange={(e) => setEditFormData({ ...editFormData, max_devices: parseInt(e.target.value) || 0 })}
                      className="mt-1 block w-full rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Payment Status</label>
                    <select
                      value={editFormData.payment_status}
                      onChange={(e) => setEditFormData({ ...editFormData, payment_status: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-primary sm:text-sm p-2 cursor-pointer"
                    >
                      <option value="paid">Paid</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="trial">Trial</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/60">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">Suspend School Account</span>
                    <span className="text-xs text-muted-foreground">Blocks all operational access and device connections.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.is_suspended}
                      onChange={(e) => setEditFormData({ ...editFormData, is_suspended: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted border border-input rounded-full peer peer-focus:ring-2 peer-focus:ring-primary/20 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-destructive peer-checked:border-destructive"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setEditingSchool(null)}
                  className="px-4 py-2 text-sm font-medium border border-input hover:bg-accent rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-md transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
