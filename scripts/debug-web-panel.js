
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConstraints() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  // Get a profile
  const { data: times } = await supabase.from('bell_times').select('profile_id').limit(1);
  const profileId = times[0].profile_id;
  
  const testTime = '10:00:00'; // Using seconds for this test to isolate constraint issue

  console.log(`Testing duplicates for Profile ${profileId} at ${testTime}`);

  // Clean up any existing test data
  await supabase.from('bell_times').delete().eq('profile_id', profileId).eq('bell_time', testTime);

  // Try inserting two rows with same time
  const rows = [
      { profile_id: profileId, bell_time: testTime, day_of_week: [1], audio_file_id: null },
      { profile_id: profileId, bell_time: testTime, day_of_week: [2], audio_file_id: null }
  ];

  const { data, error } = await supabase.from('bell_times').insert(rows).select();

  if (error) {
      console.error('INSERT FAILED (Likely Unique Constraint):', error);
  } else {
      console.log('INSERT SUCCESS (No Unique Constraint on Time):', data);
      // Clean up
      await supabase.from('bell_times').delete().eq('profile_id', profileId).eq('bell_time', testTime);
  }
}

async function testTimeFormat() {
    console.log('\nTesting Time Format "14:11"...');
    // Get a profile
    const { data: times } = await supabase.from('bell_times').select('profile_id').limit(1);
    const profileId = times[0].profile_id;

    const row = { profile_id: profileId, bell_time: '14:11', day_of_week: [0], audio_file_id: null };
    
    const { data, error } = await supabase.from('bell_times').insert([row]).select();

    if (error) {
        console.error('INSERT FAILED (Time Format):', error);
    } else {
        console.log('INSERT SUCCESS (Time Format accepted):', data);
         // Clean up
         await supabase.from('bell_times').delete().eq('id', data[0].id);
    }
}

async function run() {
    await testConstraints();
    await testTimeFormat();
}

run();
