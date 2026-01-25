
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSpecificTime() {
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  console.log('--- Searching for 03:11 schedule ---');

  // Fetch all times and filter in JS to avoid casting errors
  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*, bell_profiles(name, school_id)');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const matches = times.filter(t => t.bell_time.startsWith('03:11'));

  if (matches.length > 0) {
      matches.forEach(t => {
        console.log(`FOUND: ID: ${t.id}`);
        console.log(`  Time: "${t.bell_time}"`);
        console.log(`  Days: ${JSON.stringify(t.day_of_week)}`);
        console.log(`  Profile: ${t.bell_profiles?.name} (School ID: ${t.bell_profiles?.school_id})`);
        
        // Check if today (Sunday=0) is in the list
        const today = new Date().getDay();
        const includesToday = t.day_of_week.includes(today);
        console.log(`  Includes Today (Day ${today})? ${includesToday ? 'YES' : 'NO'}`);
      });
  } else {
      console.log('NO schedule found for 03:11.');
  }
}

checkSpecificTime();
