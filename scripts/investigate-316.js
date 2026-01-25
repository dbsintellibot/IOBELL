
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate316() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const schoolId = '11111111-1111-1111-1111-111111111111';
  console.log(`\n--- Investigating for School: ${schoolId} ---`);

  // 1. Get All Profiles
  const { data: profiles, error: profError } = await supabase
    .from('bell_profiles')
    .select('id, name')
    .eq('school_id', schoolId);

  if (profError) { console.error('Profile Error:', profError); return; }
  
  console.log(`\nFound ${profiles.length} profiles:`);
  let normalProfileId = null;
  
  for (const p of profiles) {
      console.log(` - [${p.id}] ${p.name}`);
      if (p.name.toLowerCase().includes('normal')) normalProfileId = p.id;

      // Check for 15:16 in this profile
      const { data: times } = await supabase
        .from('bell_times')
        .select('*')
        .eq('profile_id', p.id)
        .like('bell_time', '15:16%'); // Check for 15:16
        
      if (times && times.length > 0) {
          console.log(`   ✅ FOUND 15:16 in this profile! (Count: ${times.length})`);
          times.forEach(t => console.log(`      -> Time: ${t.bell_time}, Days: ${t.day_of_week}`));
      } else {
          console.log(`   ❌ No 15:16 in this profile.`);
      }
  }

  // 2. Check Device Assignment (What profile is the device actually using?)
  // The device doesn't have a 'profile_id' column usually, it uses the 'active' profile of the school or similar logic.
  // Wait, looking at firmware code: 
  // String url = String(SUPABASE_URL) + "/rest/v1/bell_profiles?select=id&school_id=eq." + String(schoolId) + "&limit=1";
  // It selects the FIRST profile it finds for the school! It doesn't check 'is_active' because the column might not exist or isn't used.
  
  console.log('\n--- Firmware Logic Simulation ---');
  const { data: firmwareProfile } = await supabase
    .from('bell_profiles')
    .select('id, name')
    .eq('school_id', schoolId)
    .limit(1);
    
  if (firmwareProfile && firmwareProfile.length > 0) {
      console.log(`ESP32 will pick: [${firmwareProfile[0].id}] ${firmwareProfile[0].name}`);
      if (normalProfileId && firmwareProfile[0].id !== normalProfileId) {
          console.warn(`⚠️ WARNING: Device is picking '${firmwareProfile[0].name}' but user edited '${profiles.find(p => p.id === normalProfileId)?.name}'!`);
      }
  } else {
      console.log('ESP32 found NO profiles.');
  }

}

investigate316();
