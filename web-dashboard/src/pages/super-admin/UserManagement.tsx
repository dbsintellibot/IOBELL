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
      alert('User created successfully')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error creating user'
      alert('Error: ' + message)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
      </div>

      {/* Create User Form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-medium text-gray-900">Create School Admin</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            createMutation.mutate()
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end"
        >
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="text" // Visible for admin convenience, or password type
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </div>
          <div className="sm:col-span-1 relative">
            <label className="block text-sm font-medium text-gray-700">School Name</label>
            <div className="relative">
              <input
                type="text"
                required
                list="schools-list"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
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
            <p className="text-xs text-gray-500 mt-1">Typing a new name will create a new school.</p>
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full inline-flex items-center justify-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* Users List */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="mb-4 text-lg font-medium text-gray-900">Existing Users</h3>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">School</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {user.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          user.role === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'school_admin' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.school?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
