
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findSchedule() {
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  // Look for any time around 2:45 PM (14:45)
  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*')
    .ilike('bell_time', '14:45%'); // Check 14:45

  if (error) console.error(error);
  
  console.log('--- Checking 14:45 (2:45 PM) ---');
  if (times && times.length > 0) {
      times.forEach(t => {
        console.log(`Found: ${t.bell_time}, Days: ${JSON.stringify(t.day_of_week)}`);
      });
  } else {
      console.log('No 14:45 schedule found.');
  }

  // Look for 02:45 just in case
  const { data: times2 } = await supabase
    .from('bell_times')
    .select('*')
    .ilike('bell_time', '02:45%'); 

  console.log('--- Checking 02:45 (2:45 AM) ---');
  if (times2 && times2.length > 0) {
      times2.forEach(t => {
        console.log(`Found: ${t.bell_time}, Days: ${JSON.stringify(t.day_of_week)}`);
      });
  } else {
      console.log('No 02:45 schedule found.');
  }
}

findSchedule();
