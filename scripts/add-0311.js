
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addMissingSchedule() {
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  // 1. Get Profile
  const { data: profiles } = await supabase
    .from('bell_profiles')
    .select('id')
    .limit(1);

  if (!profiles || profiles.length === 0) {
      console.log('No profile found');
      return;
  }
  const profileId = profiles[0].id;

  // 2. Add 03:11 Schedule for ALL days
  console.log(`Adding 03:11:00 schedule to profile ${profileId}...`);
  
  const { error } = await supabase
    .from('bell_times')
    .insert({
        profile_id: profileId,
        bell_time: '03:11:00', 
        day_of_week: [0, 1, 2, 3, 4, 5, 6] // Mon-Sun
    });

  if (error) {
      console.error('Error adding schedule:', error);
  } else {
      console.log('Successfully added schedule for 03:11:00.');
  }
}

addMissingSchedule();
