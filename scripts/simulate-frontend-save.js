
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateFrontendSave() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const profileId = '55555555-5555-5555-5555-555555555555';
  console.log(`Using Profile ID: ${profileId}`);

  // 1. Fetch existing times (Simulate Frontend Load)
  console.log('Fetching existing times...');
  const { data: schedule, error: fetchError } = await supabase
      .from('bell_times')
      .select('id, bell_time, day_of_week, audio_file_id')
      .eq('profile_id', profileId)
      .order('bell_time', { ascending: true });

  if (fetchError) {
      console.error('Fetch failed:', fetchError);
      return;
  }
  
  // 2. Simulate User Adding 2:26 PM (14:26)
  // The frontend expands the schedule, adds item, then groups it.
  // We'll skip the expand step and just construct the "localSchedule" state
  // as if the user added 2:26 PM for Monday (1), Tuesday (2), Wednesday (3).
  // AND also keep existing times.
  
  // Let's assume the user added 14:26 for Sunday (0).
  const newTime = {
      id: 'temp-123',
      bell_time: '14:26',
      audio_file_id: null,
      day_of_week: 0 // Frontend uses single day numbers in localSchedule
  };

  // Convert DB rows to localSchedule format (single day)
  let localSchedule = [];
  schedule.forEach(row => {
      const days = Array.isArray(row.day_of_week) ? row.day_of_week : [row.day_of_week];
      days.forEach(d => {
          localSchedule.push({
              id: `${row.id}-${d}`,
              bell_time: row.bell_time.slice(0, 5), // HH:mm
              audio_file_id: row.audio_file_id,
              day_of_week: d
          });
      });
  });

  localSchedule.push(newTime);

  // 3. Simulate "Save Changes" Logic (Grouping)
  console.log('Simulating Save Logic...');
  
  const grouped = new Map();

  localSchedule.forEach(item => {
      const key = `${item.bell_time}-${item.audio_file_id ?? 'null'}`;
      if (!grouped.has(key)) {
          grouped.set(key, {
              bell_time: item.bell_time, // This is usually HH:mm from input
              audio_file_id: item.audio_file_id,
              days: new Set()
          });
      }
      grouped.get(key).days.add(item.day_of_week);
  });

  const itemsToInsert = Array.from(grouped.values()).map(g => ({
      bell_time: g.bell_time, // Postgres time type handles HH:mm
      audio_file_id: g.audio_file_id,
      day_of_week: Array.from(g.days).sort((a, b) => a - b),
      profile_id: profileId
  }));

  console.log('Items to Insert:', JSON.stringify(itemsToInsert, null, 2));

  // 4. Perform DB Operations (Delete then Insert)
  console.log('Deleting old times...');
  const { error: deleteError } = await supabase
      .from('bell_times')
      .delete()
      .eq('profile_id', profileId);

  if (deleteError) {
      console.error('Delete failed:', deleteError);
      return;
  }

  console.log('Inserting new times...');
  if (itemsToInsert.length > 0) {
      const { data: insertData, error: insertError } = await supabase
          .from('bell_times')
          .insert(itemsToInsert)
          .select();
      
      if (insertError) {
          console.error('Insert failed:', insertError);
      } else {
          console.log('Save SUCCESS! Inserted:', insertData.length, 'rows.');
          // Verify 14:26 is there
          const match = insertData.find(t => t.bell_time.startsWith('14:26'));
          if (match) console.log('VERIFIED: 14:26 exists in DB.');
          else console.error('FAILED: 14:26 NOT found in inserted data.');
      }
  } else {
      console.log('No items to insert.');
  }
}

simulateFrontendSave();
