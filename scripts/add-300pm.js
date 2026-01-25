
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function add300PM() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const profileId = '55555555-5555-5555-5555-555555555555';

  const newTime = {
      profile_id: profileId,
      bell_time: '15:00:00',
      day_of_week: [0], // Sunday
      audio_file_id: null
  };

  console.log(`Inserting 3:00 PM (15:00) for Profile ${profileId}...`);
  const { data, error } = await supabase
    .from('bell_times')
    .insert([newTime])
    .select();

  if (error) {
      console.error('Insert failed:', error);
  } else {
      console.log('Success:', data);
  }
}

add300PM();
