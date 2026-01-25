
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPermissions() {
  console.log('Logging in as admin...');
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });
  const user = authData.user;
  console.log('User ID:', user.id);
  console.log('User Metadata:', user.user_metadata);

  // Check user's school
  const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  console.log('User Profile:', userProfile);

  const schoolId = userProfile?.school_id;
  console.log('User School ID:', schoolId);

  // Check the bell profile
  const { data: bellProfile } = await supabase.from('bell_profiles').select('*').eq('id', '55555555-5555-5555-5555-555555555555').single();
  console.log('Bell Profile 5555...:', bellProfile);

  if (bellProfile.school_id !== schoolId) {
      console.warn('MISMATCH! Bell Profile school_id does not match User school_id');
  } else {
      console.log('MATCH: School IDs match.');
  }

  // Try to update the profile name (test RLS)
  const { error: updateError } = await supabase
    .from('bell_profiles')
    .update({ name: bellProfile.name }) // No change
    .eq('id', bellProfile.id);

  if (updateError) {
      console.error('RLS UPDATE ERROR on bell_profiles:', updateError);
  } else {
      console.log('RLS Update Allowed on bell_profiles');
  }

  // Check bell_times permissions
  console.log('Checking bell_times permissions...');
  // Try to insert a dummy time
  const dummyTime = {
      profile_id: bellProfile.id,
      bell_time: '23:59:59',
      day_of_week: [0],
      audio_file_id: null
  };
  
  const { data: insertData, error: insertError } = await supabase.from('bell_times').insert([dummyTime]).select();
  if (insertError) {
      console.error('RLS INSERT ERROR on bell_times:', insertError);
  } else {
      console.log('RLS Insert Allowed on bell_times:', insertData);
      // Cleanup
      await supabase.from('bell_times').delete().eq('id', insertData[0].id);
  }
}

checkPermissions();
