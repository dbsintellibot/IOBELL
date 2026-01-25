
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAutoSync() {
  console.log('Logging in as admin...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  if (authError) {
    console.error('Auth failed:', authError);
    return;
  }
  
  const user = authData.user;
  // Get school_id from users table (not profiles)
  const { data: userRecord, error: userError } = await supabase.from('users').select('school_id').eq('id', user.id).single();
  
  if (userError) {
      console.error('Error fetching user record:', userError);
      return;
  }
  const schoolId = userRecord?.school_id;
  
  console.log(`User School ID: ${schoolId}`);
  
  if (!schoolId) {
      console.error('No school ID found for user.');
      return;
  }

  // 1. Fetch devices
  console.log('Fetching devices...');
  const { data: devices, error: devError } = await supabase
      .from('bell_devices')
      .select('id')
      .eq('school_id', schoolId);

  if (devError) {
      console.error('Error fetching devices:', devError);
      return;
  }
  
  console.log(`Found ${devices.length} devices.`);

  if (devices.length > 0) {
      // 2. Insert Command
      console.log('Attempting to insert CONFIG commands...');
      const commands = devices.map(d => ({
          device_id: d.id,
          school_id: schoolId,
          command: 'CONFIG',
          payload: { source: 'script_test' }
      }));

      const { data: cmdData, error: cmdError } = await supabase
          .from('command_queue')
          .insert(commands)
          .select();

      if (cmdError) {
          console.error('FAILED to insert commands:', cmdError);
      } else {
          console.log('SUCCESS: Commands inserted:', cmdData);
      }
  }
}

verifyAutoSync();
