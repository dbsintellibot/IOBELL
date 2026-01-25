
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugDevice() {
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  const mac = '84:1F:E8:26:70:D0';
  console.log(`--- Debugging Device MAC: ${mac} ---`);

  // 1. Get Device Info
  const { data: device, error: deviceError } = await supabase
    .from('bell_devices')
    .select('*, schools(name, school_code)')
    .eq('mac_address', mac)
    .single();

  if (deviceError) {
    console.error('Error fetching device:', deviceError);
    return;
  }

  console.log('Device Info:');
  console.log(`  ID: ${device.id}`);
  console.log(`  Name: ${device.name}`);
  console.log(`  Status: ${device.status}`);
  console.log(`  Assigned School ID: ${device.school_id}`);
  console.log(`  Assigned School Name: ${device.schools?.name}`);
  console.log(`  Assigned School Code: ${device.schools?.school_code}`);

  // 2. Check the "Regular Schedule" profile seen in check-0311.js
  // (We know its ID from previous logs, but let's find it by name/school to be sure)
  const targetSchoolId = '11111111-1111-1111-1111-111111111111';
  console.log(`\n--- Checking Target School (${targetSchoolId}) ---`);
  
  const { data: targetSchool } = await supabase
    .from('schools')
    .select('*')
    .eq('id', targetSchoolId)
    .single();
    
  console.log(`  Target School Name: ${targetSchool?.name}`);
  console.log(`  Target School Code: ${targetSchool?.school_code}`);

  if (device.school_id !== targetSchoolId) {
    console.log('\n!!! MISMATCH DETECTED !!!');
    console.log(`Device is assigned to school ${device.school_id} but schedules are in ${targetSchoolId}.`);
    console.log('The device will NOT download these schedules.');
  } else {
    console.log('\nSchool IDs match.');
  }
}

debugDevice();
