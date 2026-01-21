"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Zap, Clock } from 'lucide-react';

export default function Dashboard() {
  const [devices, setDevices] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkUser();
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) window.location.href = '/';
    setUser(user);
  };

  const fetchDevices = async () => {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .order('name');
    if (data) setDevices(data);
  };

  const ringBell = async (deviceId: string) => {
    if (!confirm('Are you sure you want to ring the bell now?')) return;
    
    await supabase.from('command_queue').insert({
      device_id: deviceId,
      command: 'RING',
      status: 'pending'
    });
    alert('Ring command sent!');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">AutoBell Dashboard</h1>
        <button 
          onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')}
          className="text-sm text-red-600"
        >
          Logout
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {devices.map((device) => (
          <div key={device.id} className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg">{device.name}</h3>
                <p className="text-xs text-gray-500 font-mono">{device.mac_address}</p>
              </div>
              <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} 
                   title={device.is_online ? "Online" : "Offline"} />
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => ringBell(device.id)}
                className="flex-1 bg-red-100 text-red-600 p-2 rounded flex items-center justify-center gap-2 hover:bg-red-200 transition"
              >
                <Bell size={18} />
                Ring Now
              </button>
              
              <button
                className="flex-1 bg-blue-100 text-blue-600 p-2 rounded flex items-center justify-center gap-2 hover:bg-blue-200 transition"
                onClick={() => alert('Schedule editing coming soon!')}
              >
                <Clock size={18} />
                Schedule
              </button>
            </div>
          </div>
        ))}

        {devices.length === 0 && (
          <p className="text-gray-500 text-center col-span-full py-10">No devices found. Add one in the database.</p>
        )}
      </div>
    </div>
  );
}
