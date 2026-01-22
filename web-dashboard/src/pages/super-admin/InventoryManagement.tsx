import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState({ serial_number: '', mac_address: '' })
  const [adding, setAdding] = useState(false)

  const fetchInventory = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('device_inventory')
      .select('*, schools(name)')
      .order('created_at', { ascending: false })
    
    if (!error && data) {
      setInventory(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    const { error } = await supabase
      .from('device_inventory')
      .insert([newItem])
    
    if (error) {
      alert('Error adding device: ' + error.message)
    } else {
      setNewItem({ serial_number: '', mac_address: '' })
      fetchInventory()
    }
    setAdding(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Device Inventory</h2>
      </div>

      {/* Add New Device Form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-medium text-gray-900">Add New Device Stock</h3>
        <form onSubmit={handleAdd} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Serial Number</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              value={newItem.serial_number}
              onChange={(e) => setNewItem({ ...newItem, serial_number: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">MAC Address</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              value={newItem.mac_address}
              onChange={(e) => setNewItem({ ...newItem, mac_address: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Device
          </button>
        </form>
      </div>

      {/* Inventory List */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serial Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MAC Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Claimed By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Claimed At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventory.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.serial_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.mac_address}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {item.claimed_at ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">Claimed</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-yellow-100 px-2 text-xs font-semibold leading-5 text-yellow-800">Available</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.schools?.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.claimed_at ? new Date(item.claimed_at).toLocaleDateString() : '-'}</td>
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
