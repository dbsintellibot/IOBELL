
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function forceSync() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const deviceId = 'ded284da-7d01-4f5d-a9d6-380e0bd02097'; // The user's device
  const schoolId = '11111111-1111-1111-1111-111111111111';

  console.log(`Queueing CONFIG command for device ${deviceId}...`);

  const { data, error } = await supabase
    .from('command_queue')
    .insert([{
        device_id: deviceId,
        school_id: schoolId,
        command: 'CONFIG',
        payload: { source: 'manual_force_sync' }
    }])
    .select();

  if (error) {
      console.error('Failed to queue command:', error);
  } else {
      console.log('Command queued successfully:', data);
  }
}

forceSync();
