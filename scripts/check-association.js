
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAssociation() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const schoolId = '11111111-1111-1111-1111-111111111111'; // Lincoln High
  console.log(`\n--- Checking School: ${schoolId} ---`);

  // 1. Get Devices for School
  const { data: devices, error: devError } = await supabase
    .from('bell_devices')
    .select('id, name, mac_address, status, school_id')
    .eq('school_id', schoolId);

  if (devError) { console.error('Device Error:', devError); return; }
  console.log(`Found ${devices.length} devices:`);
  devices.forEach(d => console.log(` - [${d.id}] ${d.name} (${d.mac_address})`));

  // 2. Get Profiles for School
  const { data: profiles, error: profError } = await supabase
    .from('bell_profiles')
    .select('id, name, created_at')
    .eq('school_id', schoolId);

  if (profError) { console.error('Profile Error:', profError); return; }
  console.log(`\nFound ${profiles.length} profiles:`);
  
  for (const p of profiles) {
      console.log(` - [${p.id}] ${p.name}`);
      
      // 3. Get Times for Profile
      const { data: times, error: timeError } = await supabase
        .from('bell_times')
        .select('bell_time, day_of_week')
        .eq('profile_id', p.id)
        .order('bell_time');
        
      if (times) {
          console.log(`    -> Has ${times.length} bell times.`);
          // Show Sunday (0) times
          const sundayTimes = times.filter(t => t.day_of_week && t.day_of_week.includes(0));
          if (sundayTimes.length > 0) {
              console.log(`    -> Sunday Times: ${sundayTimes.map(t => t.bell_time).join(', ')}`);
          } else {
              console.log(`    -> NO Sunday times found.`);
          }
      }
  }
}

checkAssociation();
