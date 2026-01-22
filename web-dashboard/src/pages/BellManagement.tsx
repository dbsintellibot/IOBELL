import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Wifi, WifiOff, Settings, RefreshCw } from 'lucide-react'
import { DeviceRegistrationModal } from '../components/DeviceRegistrationModal'
import { useAuth } from '@/context/AuthContext'

export default function BellManagement() {
  const { schoolId } = useAuth()
  const queryClient = useQueryClient()
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)

  const { data: devices, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bell_devices').select('*').order('name')
      if (error) {
        console.error("Error fetching devices:", error)
        throw error
      }
      return data
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  const registerDeviceMutation = useMutation({
    mutationFn: async (newDevice: { name: string; serial_number: string }) => {
      if (!schoolId) {
        throw new Error('You must be logged in with a valid school ID to register devices.')
      }

      const { error } = await supabase.rpc('claim_device', {
        p_serial_number: newDevice.serial_number,
        p_device_name: newDevice.name
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setIsRegisterModalOpen(false)
      alert('Device registered successfully!')
    },
    onError: (error) => {
      console.error('Error registering device:', error)
      alert(error instanceof Error ? error.message : 'Failed to register device. Please try again.')
    }
  })

  const sendCommandMutation = useMutation({
    mutationFn: async ({ deviceId, command, payload = {} }: { deviceId: string, command: string, payload?: any }) => {
      const { error } = await supabase.from('command_queue').insert({
        device_id: deviceId,
        command,
        payload
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      alert(`Command ${variables.command} sent successfully!`)
    },
    onError: (error) => {
      console.error('Error sending command:', error)
      alert('Failed to send command. Please try again.')
    }
  })

  if (isLoading) {
    return <div className="text-gray-500">Loading devices...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Bell Management</h2>
        <button 
          onClick={() => setIsRegisterModalOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Register New Device
        </button>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Device Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">MAC Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Last Seen</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {devices?.length === 0 ? (
                <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                        No devices found. Register a new device to get started.
                    </td>
                </tr>
            ) : (
                devices?.map((device) => (
                <tr key={device.id}>
                    <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-gray-900">{device.name}</div>
                    <div className="text-sm text-gray-500">{device.id}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                        {device.status === 'online' ? (
                            <Wifi className="mr-1 h-3 w-3" />
                        ) : (
                            <WifiOff className="mr-1 h-3 w-3" />
                        )}
                        {device.status ? device.status.toUpperCase() : 'UNKNOWN'}
                    </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{device.mac_address}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : 'Never'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button 
                        onClick={() => sendCommandMutation.mutate({ deviceId: device.id, command: 'CONFIG' })}
                        className="text-blue-600 hover:text-blue-900 inline-flex items-center mr-4"
                        disabled={sendCommandMutation.isPending}
                    >
                        <Settings className="h-4 w-4 mr-1" />
                        Config
                    </button>
                    <button 
                        onClick={() => sendCommandMutation.mutate({ deviceId: device.id, command: 'REBOOT' })}
                        className="text-red-600 hover:text-red-900 inline-flex items-center"
                        disabled={sendCommandMutation.isPending}
                    >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Reboot
                    </button>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      
      <DeviceRegistrationModal 
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onRegister={async (data) => {
          await registerDeviceMutation.mutateAsync(data)
        }}
      />
    </div>
  )
}
