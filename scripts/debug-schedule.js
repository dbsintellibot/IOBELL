
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchedule() {
  // Login as Admin
  const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  if (authError) {
    console.error('Login failed:', authError);
    return;
  }
  
  console.log('Logged in as Admin');

  // The device ID from the user's log
  const deviceId = '3e357126-ba68-41f1-80e2-20ef2a1774fd'; 
  console.log(`Checking schedule for Device ID: ${deviceId}`);

  // 1. Get Device & School
  const { data: device, error: devError } = await supabase
    .from('bell_devices')
    .select('id, school_id')
    .eq('id', deviceId)
    .single();

  if (devError) {
    console.error('Device error:', devError);
    return;
  }
  
  console.log('Device:', device);

  if (!device.school_id) {
    console.log('Device not assigned to school.');
    return;
  }

  // 2. Get Profile
  const { data: profiles, error: profError } = await supabase
    .from('bell_profiles')
    .select('id, name')
    .eq('school_id', device.school_id)
    .limit(1);

  if (profError || profiles.length === 0) {
    console.error('Profile error:', profError || 'No profile found');
    return;
  }

  const profile = profiles[0];
  console.log('Profile:', profile);

  // 3. Get Bell Times
  const { data: times, error: timeError } = await supabase
    .from('bell_times')
    .select('*')
    .eq('profile_id', profile.id);

  if (timeError) {
    console.error('Time error:', timeError);
    return;
  }

  console.log('--- Bell Times ---');
  times.forEach(t => {
    console.log(`Time: ${t.bell_time}, Days: ${JSON.stringify(t.day_of_week)}`);
  });

  // 4. Simulation
  const today = new Date();
  const currentDayNTP = today.getDay(); // 0=Sun
  const dbDay = (currentDayNTP === 0) ? 7 : currentDayNTP; // 1=Mon...7=Sun
  
  console.log('--- Simulation ---');
  console.log(`Current JS Day (0=Sun): ${currentDayNTP}`);
  console.log(`Firmware Expected Day (1=Mon...7=Sun): ${dbDay}`);
  
  const matching = times.filter(t => {
    return t.day_of_week.includes(dbDay);
  });

  console.log('Matching Schedules for TODAY:', matching.map(m => m.bell_time));
}

checkSchedule();
