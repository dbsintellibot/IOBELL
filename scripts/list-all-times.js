
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllTimes() {
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*');

  if (error) {
      console.error(error);
      return;
  }
  
  console.log('--- All Schedules ---');
  times.forEach(t => {
      // Check if it matches 2:45 (14:45 or 02:45)
      if (t.bell_time.startsWith('14:45') || t.bell_time.startsWith('02:45')) {
          console.log(`*** MATCH *** ID: ${t.id}, Time: "${t.bell_time}", Days: ${JSON.stringify(t.day_of_week)}`);
      } else {
          console.log(`ID: ${t.id}, Time: "${t.bell_time}", Days: ${JSON.stringify(t.day_of_week)}`);
      }
  });
}

listAllTimes();
