import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Building, Mail, Lock, MapPin, Wifi, WifiOff } from 'lucide-react'

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
}

export default function SchoolManagement() {
  const queryClient = useQueryClient()
  
  // Form State
  const [formData, setFormData] = useState({
    schoolName: '',
    campusName: '',
    address: '',
    email: '',
    password: ''
  })
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const { data: schools = [] } = useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      const [schoolsResponse, devicesResponse] = await Promise.all([
        supabase
          .from('schools')
          .select('id, name, campus_name, address, payment_status, max_devices, created_at, logo_url, users(email)')
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
          is_online: onlineMap.get(typed.id) ?? false
        } as School
      })
    }
  })

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
        <div className="px-4 py-5 sm:px-6 border-b border-border">
          <h3 className="text-lg font-medium leading-6 text-foreground">Registered Schools</h3>
        </div>
        <ul className="divide-y divide-border">
          {schools.map((school) => (
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
                    <p className="text-sm font-medium text-primary truncate">{school.name}</p>
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
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm text-foreground">
                    Admin: {school.users?.[0]?.email || 'None'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Devices: {school.max_devices}
                  </p>
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
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
