
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSunday247() {
  console.log('Logging in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  if (authError) {
    console.error('Auth failed:', authError);
    return;
  }

  console.log('Querying bell_times for 14:47...');
  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*');

  if (error) {
      console.error(error);
      return;
  }
  
  let found = false;
  times.forEach(t => {
      // Check for 14:47
      const timeMatch = t.bell_time.startsWith('14:47');
      
      if (timeMatch) {
          console.log(`FOUND MATCH: ID: ${t.id}, Time: "${t.bell_time}", Days: ${JSON.stringify(t.day_of_week)}`);
          found = true;
      }
  });

  if (!found) {
      console.log('No exact match for 14:47 found.');
      // Print anything close
      console.log('--- Nearby times (14:4x) ---');
      times.forEach(t => {
        if (t.bell_time.startsWith('14:4')) {
             console.log(`Close match: ID: ${t.id}, Time: "${t.bell_time}", Days: ${JSON.stringify(t.day_of_week)}`);
        }
      });
  }
}

checkSunday247();
