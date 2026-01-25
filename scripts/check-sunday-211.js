
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using service role if available for bypass RLS, but user said "requested from web panel" so anon is fine if we login as admin

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSunday211() {
  console.log('Logging in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  if (authError) {
    console.error('Auth failed:', authError);
    return;
  }

  console.log('Querying bell_times...');
  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*');

  if (error) {
      console.error(error);
      return;
  }
  
  console.log('--- Checking for 2:26 PM (14:26) ---');
  let found = false;
  times.forEach(t => {
      // 2:26 PM is 14:26
      const days = Array.isArray(t.day_of_week) ? t.day_of_week : [t.day_of_week];
      const timeMatch = t.bell_time.startsWith('14:26');
      
      if (timeMatch) {
          console.log(`FOUND TIME MATCH: ID: ${t.id}, Time: "${t.bell_time}", Days: ${JSON.stringify(t.day_of_week)}`);
          found = true;
      }
  });

  if (!found) {
      console.log('No exact match for 14:26 found.');
      // Print anything close
      console.log('--- Nearby times ---');
      times.forEach(t => {
        if (t.bell_time.startsWith('14:1') || t.bell_time.startsWith('02:1')) {
             console.log(`Close match: ID: ${t.id}, Time: "${t.bell_time}", Days: ${JSON.stringify(t.day_of_week)}`);
        }
      });
  }
}

checkSunday211();
