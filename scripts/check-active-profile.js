
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActiveProfile() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const schoolId = '11111111-1111-1111-1111-111111111111';
  console.log(`Checking profiles for School ID: ${schoolId}`);

  // This matches the logic in main.cpp:
  // String url = String(SUPABASE_URL) + "/rest/v1/bell_profiles?select=id&school_id=eq." + String(schoolId) + "&limit=1";
  
  const { data: profiles, error } = await supabase
    .from('bell_profiles')
    .select('id, name, school_id')
    .eq('school_id', schoolId)
    // Supabase REST API default order might be by ID or creation time if not specified.
    // main.cpp does NOT specify order.
    // We should see ALL profiles to guess which one it picks (likely the first one returned).
  
  if (error) {
      console.error('Error fetching profiles:', error);
      return;
  }

  console.log(`Found ${profiles.length} profiles:`);
  profiles.forEach((p, index) => {
      console.log(`[${index}] ID: ${p.id} | Name: "${p.name}"`);
  });

  if (profiles.length > 0) {
      const likelyActive = profiles[0].id;
      console.log(`\nFIRMWARE LIKELY USES: ${likelyActive}`);
      
      // Check if my 3:00 PM (15:00) is in THIS profile
      const { data: times } = await supabase
          .from('bell_times')
          .select('*')
          .eq('profile_id', likelyActive)
          .eq('bell_time', '15:00:00');
          
      if (times && times.length > 0) {
          console.log(`MATCH: 15:00:00 IS in this profile.`);
      } else {
          console.error(`MISMATCH: 15:00:00 is NOT in this profile!`);
          
          // Where did I put it?
          console.log('Checking where 15:00:00 is...');
          const { data: lostTimes } = await supabase.from('bell_times').select('profile_id').eq('bell_time', '15:00:00');
          lostTimes.forEach(t => console.log(`It is in Profile: ${t.profile_id}`));
      }
  }
}

checkActiveProfile();
