import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Link as LinkIcon } from 'lucide-react'

type InventoryItem = {
  id: string
  serial_number: string
  mac_address: string
  claimed_at: string | null
  claimed_by_school_id?: string
  schools?: { name: string } | { name: string }[] | null
}

export default function InventoryManagement() {
  const queryClient = useQueryClient()
  const [newItem, setNewItem] = useState({ serial_number: '', mac_address: '' })
  const [selectedSchools, setSelectedSchools] = useState<Record<string, string>>({})

  const { data: schools = [] } = useQuery({
    queryKey: ['schools_list'],
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('id, name').order('name')
      return data || []
    }
  })

  const { data: detectedDevices = [] } = useQuery({
    queryKey: ['detected_devices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bell_devices')
        .select('*')
      if (error) return []
      return data
    }
  })

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['device_inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_inventory')
        .select('id, serial_number, mac_address, claimed_at, claimed_by_school_id, schools(name)')
        .order('created_at', { ascending: false })
      if (error || !data) return []
      return data as unknown as InventoryItem[]
    }
  })

  // Filter out devices that are already in inventory to show as "detected but unassigned/rogue"
  const inventoryMacs = new Set(inventory.map((i: any) => i.mac_address))
  const unassignedDevices = detectedDevices.filter((d: any) => !inventoryMacs.has(d.mac_address))


  const assignDetectedMutation = useMutation({
    mutationFn: async ({ device, schoolId }: { device: any, schoolId: string }) => {
      // 1. Update bell_devices
      const { error: bellError } = await supabase
        .from('bell_devices')
        .update({ school_id: schoolId })
        .eq('mac_address', device.mac_address)
      
      if (bellError) throw bellError

      // 2. Add to device_inventory if not exists
      // Extract serial from name if possible (e.g. "Bell-12345")
      let serial = device.name?.replace('Bell-', '') || ''
      // If serial is generic or empty, use MAC address
      if (!serial || serial === 'AutoBell Device' || serial === 'UNKNOWN' || serial.trim() === '') {
        serial = device.mac_address.replace(/:/g, '').toUpperCase()
      }
      
      const { error: invError } = await supabase
        .from('device_inventory')
        .upsert({
          mac_address: device.mac_address,
          claimed_by_school_id: schoolId,
          serial_number: serial,
          claimed_at: new Date().toISOString()
        }, { onConflict: 'mac_address' })

      if (invError) throw invError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      queryClient.invalidateQueries({ queryKey: ['detected_devices'] })
      alert('Device assigned successfully')
      setSelectedSchools({})
    },
    onError: (error) => {
      console.error(error)
      alert(`Failed to assign detected device: ${error.message}`)
    }
  })

  const assignMutation = useMutation({
    mutationFn: async ({ item, schoolId }: { item: InventoryItem, schoolId: string }) => {
      // 1. Update device_inventory
      const { error: invError } = await supabase
        .from('device_inventory')
        .update({ 
          claimed_by_school_id: schoolId,
          claimed_at: new Date().toISOString()
        })
        .eq('id', item.id)
      
      if (invError) throw invError

      // 2. Create/Update bell_devices
      // We assume mac_address is unique for bell_devices
      const { error: bellError } = await supabase
        .from('bell_devices')
        .upsert({
            mac_address: item.mac_address,
            school_id: schoolId,
            name: `Bell-${item.serial_number}`,
            status: 'offline'
        }, { onConflict: 'mac_address' })
        
      if (bellError) throw bellError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      alert('Device assigned successfully')
      setSelectedSchools({})
    },
    onError: (error) => {
      console.error(error)
      alert(`Failed to assign inventory device: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('device_inventory')
        .insert([newItem])
      if (error) throw error
    },
    onSuccess: () => {
      setNewItem({ serial_number: '', mac_address: '' })
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error adding device'
      alert(message)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Device Inventory</h2>
      </div>

      {/* Detected Unassigned Devices */}
      {unassignedDevices.length > 0 && (
        <div className="overflow-hidden rounded-lg bg-white shadow border border-purple-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="mb-4 text-lg font-medium text-purple-900">Detected Unassigned Devices (Online)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-purple-200">
                <thead className="bg-purple-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-purple-800 uppercase tracking-wider">Name / Serial</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-purple-800 uppercase tracking-wider">MAC Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-purple-800 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-purple-800 uppercase tracking-wider">Last Seen</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-purple-800 uppercase tracking-wider">Assign To School</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-purple-100">
                  {unassignedDevices.map((device: any) => (
                    <tr key={device.mac_address}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{device.name || 'Unknown'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.mac_address}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {device.status || 'unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {device.last_seen ? new Date(device.last_seen).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <select 
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 border p-1"
                            value={selectedSchools[device.mac_address] || ''}
                            onChange={(e) => setSelectedSchools(prev => ({...prev, [device.mac_address]: e.target.value}))}
                          >
                            <option value="">Select School</option>
                            {schools.map(school => (
                              <option key={school.id} value={school.id}>{school.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const schoolId = selectedSchools[device.mac_address]
                              if (schoolId) {
                                assignDetectedMutation.mutate({ device, schoolId })
                              }
                            }}
                            disabled={!selectedSchools[device.mac_address] || assignDetectedMutation.isPending}
                            className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                          >
                            <LinkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add New Device Form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-medium text-gray-900">Add New Device Stock</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            addMutation.mutate()
          }}
          className="flex gap-4 items-end"
        >
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
            disabled={addMutation.isPending}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            {addMutation.isPending ? 'Adding...' : 'Add Device'}
          </button>
        </form>
      </div>

      {/* Inventory List */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          {isLoading ? (
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
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {Array.isArray(item.schools) 
                          ? item.schools[0]?.name || '-' 
                          : item.schools?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.claimed_at ? new Date(item.claimed_at).toLocaleDateString() : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {!item.claimed_at && (
                            <div className="flex items-center justify-end gap-2">
                                <select 
                                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-1"
                                    value={selectedSchools[item.id] || ''}
                                    onChange={(e) => setSelectedSchools(prev => ({...prev, [item.id]: e.target.value}))}
                                >
                                    <option value="">Select School</option>
                                    {schools.map(school => (
                                        <option key={school.id} value={school.id}>{school.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => {
                                        const schoolId = selectedSchools[item.id]
                                        if (schoolId) {
                                            assignMutation.mutate({ item, schoolId })
                                        }
                                    }}
                                    disabled={!selectedSchools[item.id] || assignMutation.isPending}
                                    className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                                >
                                    <LinkIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}
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
