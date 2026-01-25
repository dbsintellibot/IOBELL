
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use Service Role Key if available to bypass RLS, otherwise fallback to Anon
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log(`Using key type: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE (Bypass RLS)' : 'ANON (Respect RLS)'}`);

if (!supabaseKey) {
    console.error('ERROR: No Supabase Key found. Please check .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function globalSearch() {
  // If using Anon key, we must login to see anything protected by RLS
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Logging in as admin to maximize visibility...');
      await supabase.auth.signInWithPassword({
        email: 'admin@lincoln.edu',
        password: 'password123'
      });
  }

  console.log('--- Searching for 14:47 in ENTIRE bell_times table ---');
  
  // 1. Search by exact time string
  const { data: exactMatches, error: exactError } = await supabase
    .from('bell_times')
    .select('*, bell_profiles(name, school_id)')
    .like('bell_time', '14:47%');

  if (exactError) console.error('Exact search error:', exactError);
  else if (exactMatches.length > 0) {
      console.log('!!! FOUND EXACT MATCHES !!!');
      console.log(JSON.stringify(exactMatches, null, 2));
  } else {
      console.log('No exact matches found for 14:47%.');
  }

  // 2. Search by UTC time (assuming GMT+5, 14:47 -> 09:47)
  const { data: utcMatches } = await supabase
    .from('bell_times')
    .select('*, bell_profiles(name, school_id)')
    .like('bell_time', '09:47%');

  if (utcMatches && utcMatches.length > 0) {
      console.log('!!! FOUND UTC MATCHES (09:47) !!!');
      console.log(JSON.stringify(utcMatches, null, 2));
  }

  // 3. Search for ANY recently created records (last 30 mins)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  console.log(`--- Searching for ANY records created after ${thirtyMinsAgo} ---`);
  
  const { data: recent } = await supabase
      .from('bell_times')
      .select('*, bell_profiles(name, school_id)')
      .gt('created_at', thirtyMinsAgo)
      .order('created_at', { ascending: false });

  if (recent && recent.length > 0) {
      console.log(`Found ${recent.length} recent records:`);
      recent.forEach(r => {
          console.log(`[${r.bell_time}] Profile: ${r.profile_id} (${r.bell_profiles?.name}), Created: ${r.created_at}`);
      });
  } else {
      console.log('No recent records found.');
  }

  // 4. Check Device Link
  // Let's see which profile the Main Bell is actually using
  console.log('--- Checking Device Configuration ---');
  const { data: devices } = await supabase
      .from('bell_devices')
      .select('*, schools(name)');
      
  if (devices) {
      devices.forEach(d => {
           console.log(`Device: ${d.name} (${d.id}) | School: ${d.school_id}`);
           // Note: bell_devices usually links to school, not profile directly. 
           // Profile is linked to school.
           // Let's find which profile is "active" for this school?
           // The firmware fetches profile by school_id usually, or there is a default profile.
      });
  }
}

globalSearch();
