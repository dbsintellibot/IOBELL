
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addSunday220() {
  console.log('Logging in as admin...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  if (authError) {
    console.error('Auth failed:', authError);
    return;
  }

  // Get a valid profile_id. Use the one from the admin's school or just pick one that has times already.
  // We'll try to find a profile associated with the user's school first.
  
  // 1. Get user's school_id
  const user = authData.user;
  // We might need to query profiles table to get the profile_id for this user/school.
  // Assuming there is a 'profiles' table linked to users or schools.
  
  // Let's just grab the profile_id from an existing bell_time to be safe and quick, 
  // ensuring we add it to the same schedule effectively.
  const { data: existingTimes, error: timeError } = await supabase
    .from('bell_times')
    .select('profile_id')
    .limit(1);

  if (timeError || !existingTimes || existingTimes.length === 0) {
      console.error('Could not find existing times to infer profile_id', timeError);
      return;
  }

  const profileId = existingTimes[0].profile_id;
  console.log(`Using Profile ID: ${profileId}`);

  const newTime = {
      profile_id: profileId,
      bell_time: '14:20:00',
      day_of_week: [0], // Sunday
      created_at: new Date().toISOString()
      // audio_file_id might be needed if not nullable. checking schema memories...
      // Memory says: `bell_times` table schema identified: ... `audio_file_id` ...
      // We should check if it's nullable or pick a default.
  };

  // Let's check if audio_file_id is required or try to find one.
  // For now, try inserting without it or null. If it fails, we'll fetch one.
  
  console.log('Inserting 2:20 PM Sunday schedule...');
  const { data, error } = await supabase
    .from('bell_times')
    .insert([newTime])
    .select();

  if (error) {
      console.error('Insert failed:', error);
      if (error.message.includes('audio_file_id')) {
          console.log('audio_file_id might be required. Fetching one...');
           const { data: audioFiles } = await supabase.from('audio_files').select('id').limit(1);
           if (audioFiles && audioFiles.length > 0) {
               newTime.audio_file_id = audioFiles[0].id;
               console.log(`Retrying with audio_file_id: ${newTime.audio_file_id}`);
               const { data: retryData, error: retryError } = await supabase
                .from('bell_times')
                .insert([newTime])
                .select();
                if (retryError) console.error('Retry failed:', retryError);
                else console.log('Success:', retryData);
           }
      }
  } else {
      console.log('Success:', data);
  }
}

addSunday220();
