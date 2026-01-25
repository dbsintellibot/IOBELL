
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndAddSchedule() {
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  // 1. Check for 03:16 AM
  console.log('--- Checking for 03:16:00 ---');
  const { data: times316, error: error316 } = await supabase
    .from('bell_times')
    .select('*')
    .eq('bell_time', '03:16:00');

  let found316 = false;
  if (times316 && times316.length > 0) {
      times316.forEach(t => {
          if (t.day_of_week.includes(0)) { // 0 = Sunday
              console.log(`FOUND 03:16:00 for Sunday (ID: ${t.id})`);
              found316 = true;
          }
      });
  }

  if (!found316) {
      console.log('03:16:00 for Sunday NOT found.');
      
      // 2. Add 03:18 AM
      console.log('--- Adding 03:18:00 for ALL days ---');
      
      // Get Profile
      const { data: profiles } = await supabase.from('bell_profiles').select('id').limit(1);
      const profileId = profiles[0].id;

      const { error: insertError } = await supabase
        .from('bell_times')
        .insert({
            profile_id: profileId,
            bell_time: '03:18:00',
            day_of_week: [0, 1, 2, 3, 4, 5, 6] // Include Sunday (0)
        });
      
      if (insertError) console.error('Error adding 03:18:', insertError);
      else console.log('Successfully added 03:18:00.');
  }
}

checkAndAddSchedule();
