import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

export default function SchoolManagement() {
  const [schools, setSchools] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newSchool, setNewSchool] = useState({ name: '', address: '', max_devices: 10 })
  const [adding, setAdding] = useState(false)

  const fetchSchools = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (!error && data) {
      setSchools(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSchools()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    const { error } = await supabase
      .from('schools')
      .insert([newSchool])
    
    if (error) {
      alert('Error adding school: ' + error.message)
    } else {
      setNewSchool({ name: '', address: '', max_devices: 10 })
      fetchSchools()
    }
    setAdding(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">School Management</h2>
      </div>

      {/* Add New School Form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-medium text-gray-900">Create New School</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
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
              onChange={(e) => setNewSchool({ ...newSchool, max_devices: parseInt(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              disabled={adding}
              className="w-full inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create
            </button>
          </div>
        </form>
      </div>

      {/* Schools List */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max Devices</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {schools.map((school) => (
                    <tr key={school.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{school.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{school.address}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${school.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {school.payment_status || 'due'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{school.max_devices}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(school.created_at).toLocaleDateString()}</td>
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
