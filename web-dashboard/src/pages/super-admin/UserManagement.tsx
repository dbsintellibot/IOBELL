import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Trash2, KeyRound, ChevronLeft, ChevronRight, X } from 'lucide-react'

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

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const from = (currentPage - 1) * pageSize
  const to = from + pageSize - 1

  // Password Reset State
  const [resettingUserEmail, setResettingUserEmail] = useState<string | null>(null)

  // Delete User Modal State
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('')

  // Fetch Users
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ['users_admin_list', currentPage, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('users_with_school')
        .select('*', { count: 'exact' })

      if (searchQuery.trim()) {
        query = query.or(`email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%,school_name.ilike.%${searchQuery}%`)
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to)
      
      if (error) throw error
      
      const mappedUsers = (data || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        created_at: u.created_at,
        tts_enabled: u.tts_enabled,
        ota_enabled: u.ota_enabled,
        school: u.school_name ? { name: u.school_name } : null
      })) as UserData[]

      return {
        users: mappedUsers,
        totalCount: count || 0
      }
    }
  })

  const users = queryResult?.users || []
  const totalCount = queryResult?.totalCount || 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

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

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string, role: string }) => {
      const { error } = await supabase
        .from('users')
        .update({ role })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_admin_list'] })
      setNotification({ type: 'success', message: 'User role updated successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error updating role'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNotification({ type: 'success', message: `Password reset link sent successfully to ${resettingUserEmail}` })
      setResettingUserEmail(null)
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error resetting password'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setResettingUserEmail(null)
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('delete_user_secure', {
        target_user_id: userId
      })
      if (error) throw error
    },
    onSuccess: () => {
      setUserToDelete(null)
      setDeleteConfirmationText('')
      queryClient.invalidateQueries({ queryKey: ['users_admin_list'] })
      setNotification({ type: 'success', message: 'User deleted successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error deleting user'
      setNotification({ type: 'error', message: 'Error: ' + message })
      setUserToDelete(null)
      setDeleteConfirmationText('')
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
        {/* Toolbar with Search */}
        <div className="px-4 py-4 sm:px-6 border-b border-border flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-muted/10">
          <h3 className="text-lg font-medium text-foreground">Existing Users</h3>
          
          <div className="relative flex-1 sm:w-64 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Search by email, name, or school..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-input bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/60 transition-colors"
            />
          </div>
        </div>

        <div className="px-4 py-5 sm:p-6">
          {isLoading ? (
            <p>Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 animate-pulse">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Permissions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">School</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-background text-foreground divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                        {user.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {user.full_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {user.role === 'super_admin' ? (
                          <span className="inline-flex rounded-full bg-primary/10 px-2 text-xs font-semibold leading-5 text-primary">
                            super_admin
                          </span>
                        ) : (
                          <select
                            value={user.role}
                            disabled={updateRoleMutation.isPending}
                            onChange={(e) => updateRoleMutation.mutate({ userId: user.id, role: e.target.value })}
                            className="rounded-md border border-input bg-background text-foreground text-xs p-1 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors cursor-pointer"
                          >
                            <option value="admin">admin</option>
                            <option value="operator">operator</option>
                          </select>
                        )}
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              if (user.email) {
                                setResettingUserEmail(user.email)
                                resetPasswordMutation.mutate(user.email)
                              }
                            }}
                            disabled={resetPasswordMutation.isPending && resettingUserEmail === user.email}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-accent rounded-md transition-colors"
                            title="Reset Password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          {user.role !== 'super_admin' && (
                            <button
                              onClick={() => {
                                setUserToDelete(user)
                                setDeleteConfirmationText('')
                              }}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                              title="Delete User"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
                  Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, totalCount)}
                  </span>{' '}
                  of <span className="font-medium">{totalCount}</span> users
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

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl bg-card text-foreground p-6 shadow-2xl border border-border flex flex-col gap-6 scale-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <h3 className="text-lg font-semibold text-foreground">Confirm Delete User</h3>
              </div>
              <button 
                onClick={() => setUserToDelete(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <span className="font-semibold text-foreground">{userToDelete.email}</span>? 
                This will permanently delete the user's authentication account and public profile. This action cannot be undone.
              </p>
              
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mb-2">
                  Type <span className="text-foreground select-none">delete</span> to confirm
                </label>
                <input
                  type="text"
                  placeholder="delete"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  className="w-full rounded-md border border-input bg-background text-foreground focus:border-destructive focus:ring-destructive sm:text-sm p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-sm font-medium border border-input hover:bg-accent rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmationText !== 'delete' || deleteUserMutation.isPending}
                onClick={() => deleteUserMutation.mutate(userToDelete.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
