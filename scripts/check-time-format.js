
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTimeFormat() {
  // Login as Admin to ensure access
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  console.log('--- Checking Bell Times Format ---');
  
  const { data: times, error } = await supabase
    .from('bell_times')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (times.length === 0) {
    console.log('No bell times found.');
    return;
  }

  times.forEach(t => {
    console.log(`ID: ${t.id}, Time: "${t.bell_time}" (Type: ${typeof t.bell_time}), Days: ${JSON.stringify(t.day_of_week)}`);
  });
}

checkTimeFormat();
