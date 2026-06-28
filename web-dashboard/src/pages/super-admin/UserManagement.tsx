import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

type UserData = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  created_at: string
  tts_enabled: boolean
  ota_enabled: boolean
  school: {
    name: string
  } | null
}

type School = {
  id: string
  name: string
}

export default function UserManagement() {
  const queryClient = useQueryClient()
  const [newUser, setNewUser] = useState({ email: '', password: '', schoolName: '' })
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Fetch Users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users_admin_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id, 
          email, 
          full_name, 
          role, 
          created_at,
          tts_enabled,
          ota_enabled,
          school:schools(name)
        `)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      // @ts-expect-error: Supabase types might not reflect the dynamic join perfectly or the email column yet
      return data as UserData[]
    }
  })

  // Fetch Schools for autocomplete
  const { data: schools = [] } = useQuery({
    queryKey: ['schools_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .order('name')
      if (error) return []
      return data as School[]
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_school_admin', {
        email_input: newUser.email,
        password_input: newUser.password,
        school_name_input: newUser.schoolName
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setNewUser({ email: '', password: '', schoolName: '' })
      queryClient.invalidateQueries({ queryKey: ['users_admin_list'] })
      queryClient.invalidateQueries({ queryKey: ['schools_list'] }) // In case a new school was created
      setNotification({ type: 'success', message: 'User created successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error creating user'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const toggleTTSMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string, enabled: boolean }) => {
      const { error } = await supabase.rpc('toggle_user_tts', {
        target_user_id: userId,
        enabled: enabled
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_admin_list'] })
      setNotification({ type: 'success', message: 'TTS permission updated' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error updating permission'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const toggleOTAMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string, enabled: boolean }) => {
      const { error } = await supabase.rpc('toggle_user_ota', {
        target_user_id: userId,
        enabled: enabled
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_admin_list'] })
      setNotification({ type: 'success', message: 'OTA permission updated' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error updating permission'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">User Management</h2>
      </div>

      {notification && (
        <div className={`p-4 rounded-md ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {/* Create User Form */}
      <div className="rounded-lg bg-card text-foreground p-6 shadow border border-border">
        <h3 className="mb-4 text-lg font-medium text-foreground">Create School Admin</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            createMutation.mutate()
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end"
        >
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-foreground">Password</label>
            <input
              type="text" // Visible for admin convenience, or password type
              required
              className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </div>
          <div className="sm:col-span-1 relative">
            <label className="block text-sm font-medium text-foreground">School Name</label>
            <div className="relative">
              <input
                type="text"
                required
                list="schools-list"
                className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                value={newUser.schoolName}
                onChange={(e) => {
                  setNewUser({ ...newUser, schoolName: e.target.value })
                }}
                placeholder="Select or type new school"
              />
              <datalist id="schools-list">
                {schools.map(school => (
                  <option key={school.id} value={school.name} />
                ))}
              </datalist>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Typing a new name will create a new school.</p>
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full inline-flex items-center justify-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* Users List */}
      <div className="overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="mb-4 text-lg font-medium text-foreground">Existing Users</h3>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Permissions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">School</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created At</th>
                  </tr>
                </thead>
                <tbody className="bg-background text-foreground divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                        {user.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          user.role === 'super_admin' ? 'bg-primary/10 text-primary' :
                          user.role === 'school_admin' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        <div className="flex flex-col gap-2">
                          {/* TTS Toggle */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground w-8">TTS:</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => toggleTTSMutation.mutate({ userId: user.id, enabled: true })}
                                disabled={toggleTTSMutation.isPending || user.tts_enabled}
                                className={`inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                                  user.tts_enabled
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-default'
                                    : 'bg-background border-input text-foreground hover:bg-accent'
                                } ${toggleTTSMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                On
                              </button>
                              <button
                                onClick={() => toggleTTSMutation.mutate({ userId: user.id, enabled: false })}
                                disabled={toggleTTSMutation.isPending || !user.tts_enabled}
                                className={`inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-destructive ${
                                  !user.tts_enabled
                                    ? 'bg-destructive/10 text-destructive dark:text-red-400 cursor-default'
                                    : 'bg-background border-input text-foreground hover:bg-accent'
                                } ${toggleTTSMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                Off
                              </button>
                            </div>
                          </div>

                          {/* OTA Toggle */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground w-8">OTA:</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => toggleOTAMutation.mutate({ userId: user.id, enabled: true })}
                                disabled={toggleOTAMutation.isPending || user.ota_enabled}
                                className={`inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                                  user.ota_enabled
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-default'
                                    : 'bg-background border-input text-foreground hover:bg-accent'
                                } ${toggleOTAMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                On
                              </button>
                              <button
                                onClick={() => toggleOTAMutation.mutate({ userId: user.id, enabled: false })}
                                disabled={toggleOTAMutation.isPending || !user.ota_enabled}
                                className={`inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-destructive ${
                                  !user.ota_enabled
                                    ? 'bg-destructive/10 text-destructive dark:text-red-400 cursor-default'
                                    : 'bg-background border-input text-foreground hover:bg-accent'
                                } ${toggleOTAMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                Off
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {user.school?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
