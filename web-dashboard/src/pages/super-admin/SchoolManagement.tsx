import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, UserPlus } from 'lucide-react'

type School = {
  id: string
  name: string
  address: string | null
  payment_status: string | null
  max_devices: number | null
  created_at: string
  users: { email: string }[]
}

export default function SchoolManagement() {
  const queryClient = useQueryClient()
  const [newSchool, setNewSchool] = useState({ name: '', address: '', max_devices: 10 })
  const [adminModal, setAdminModal] = useState<{ isOpen: boolean, schoolName: string }>({ isOpen: false, schoolName: '' })
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '' })

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name, address, payment_status, max_devices, created_at, users(email)')
        .order('created_at', { ascending: false })
      if (error || !data) return []
      return data as School[]
    }
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('schools')
        .insert([newSchool])
      if (error) throw error
    },
    onSuccess: () => {
      setNewSchool({ name: '', address: '', max_devices: 10 })
      queryClient.invalidateQueries({ queryKey: ['schools'] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error adding school'
      alert(message)
    }
  })

  const createAdminMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_school_admin', {
        email_input: newAdmin.email,
        password_input: newAdmin.password,
        school_name_input: adminModal.schoolName
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setNewAdmin({ email: '', password: '' })
      setAdminModal({ isOpen: false, schoolName: '' })
      queryClient.invalidateQueries({ queryKey: ['schools'] })
      alert('School Admin created successfully')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error creating admin'
      alert('Error: ' + message)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">School Management</h2>
      </div>

      {/* Add New School Form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-medium text-gray-900">Create New School</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            addMutation.mutate()
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end"
        >
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700">School Name</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              value={newSchool.name}
              onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Address</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              value={newSchool.address}
              onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Max Devices</label>
            <input
              type="number"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              value={newSchool.max_devices}
              onChange={(e) => setNewSchool({ ...newSchool, max_devices: Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="w-full inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              {addMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      {/* Schools List */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admins</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max Devices</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {schools.map((school) => (
                    <tr key={school.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{school.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{school.address}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {school.users?.map(u => u.email).join(', ') || 'No Admins'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${school.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {school.payment_status || 'due'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{school.max_devices}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(school.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setAdminModal({ isOpen: true, schoolName: school.name })}
                          className="text-blue-600 hover:text-blue-900 flex items-center justify-end w-full"
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add Admin
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Admin Modal */}
      {adminModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Admin for {adminModal.schoolName}</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              createAdminMutation.mutate()
            }}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdminModal({ isOpen: false, schoolName: '' })}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAdminMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  {createAdminMutation.isPending ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
