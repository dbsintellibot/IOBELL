
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check233() {
  console.log('Checking for 2:33 PM (14:33)...');
  
  // Login first to ensure RLS doesn't block (though we have anon key, policies might require auth for some tables)
  // Admin login is safest
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*');

  if (error) {
      console.error('Error:', error);
      return;
  }

  // Check for any times created recently
  console.log('Checking for any recent entries (last 1 hour)...');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: recent, error: recentError } = await supabase
      .from('bell_times')
      .select('*')
      .gt('created_at', oneHourAgo)
      .order('created_at', { ascending: false });

  if (recent && recent.length > 0) {
      console.log('Found recent entries:');
      recent.forEach(t => {
           console.log(`   - Time: ${t.bell_time}, Days: ${JSON.stringify(t.day_of_week)}, Created: ${t.created_at}`);
      });
  } else {
      console.log('No entries created in the last hour.');
  }

  // Filter in JS to avoid type casting issues with Postgres time column
  const matches = times.filter(t => t.bell_time.startsWith('14:33'));

  if (matches.length > 0) {
      console.log('✅ FOUND 2:33 PM (14:33) in Database!');
      matches.forEach(t => {
          console.log(`   - ID: ${t.id}, Time: ${t.bell_time}, Days: ${JSON.stringify(t.day_of_week)}, Profile: ${t.profile_id}`);
      });
  } else {
      console.log('❌ NOT FOUND. 2:33 PM is NOT in the database yet.');
  }
}

check233();
