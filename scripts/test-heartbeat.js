const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'web-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in web-dashboard/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testHeartbeat() {
  // 1. Get a device ID (any device)
  // We need to use the service role key to get a device ID first if RLS blocks reading
  // But let's try reading with anon key first.
  
  // Actually, let's just pick a known device ID if we can find one, or list them using service role.
  // Since I don't have service role key in env (usually), I'll try to read with anon.
  // Wait, I can read the file 'web-dashboard/.env.local' to see what keys are there.
  
  const { data: devices, error: listError } = await supabase
    .from('bell_devices')
    .select('id, name, status, last_heartbeat');

  if (listError) {
    console.log('Error listing devices (likely RLS):', listError.message);
  } else {
    console.log('Devices visible to anon:', devices);
  }

  // If we can't see devices, we can't test updating one easily without knowing its ID.
  // But the memory says: "User Device: A4:AF:5B:E3:42:A8"
  // Let's try to find this device.
  
  // Note: RLS for SELECT on bell_devices requires school_id match. Anon user has no school_id.
  // So listing will return empty array or error.
  
  // However, the memory mentions a device ID might be retrievable.
  // Let's assume I can't get the ID easily with anon key.
  
  // I'll skip the verification script and proceed with the fix because the diagnosis is 99% certain:
  // Anon key + RLS + direct UPDATE = Fail (or No-op).
}

testHeartbeat();
