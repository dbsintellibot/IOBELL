import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://zelpaafberhmslyoegzu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEVICE_MAC = '34:94:54:EF:05:C0';

async function registerDevice() {
  console.log(`Calling register_device_from_esp for ${DEVICE_MAC}...`);
  const { data, error } = await supabase.rpc('register_device_from_esp', {
    p_mac_address: DEVICE_MAC,
    p_school_code: null,
    p_device_name: 'Backup Device',
    p_firmware_version: 'esp32-s3-test',
    p_board_type: 'esp32-s3'
  });

  if (error) {
    console.error('register_device_from_esp error:', error);
  } else {
    console.log('register_device_from_esp response:', JSON.stringify(data, null, 2));
  }
}

async function checkConfig() {
  console.log(`Calling get_device_config for ${DEVICE_MAC}...`);
  const { data, error } = await supabase.rpc('get_device_config', {
    device_mac: DEVICE_MAC
  });

  if (error) {
    console.error('get_device_config error:', error);
  } else {
    console.log('get_device_config status:', data.status);
    console.log('get_device_config profile:', data.profile_name);
    if (data.schedules) {
      console.log('Schedule Count:', data.schedules.length);
      console.log('First schedule (JSON):', JSON.stringify(data.schedules[0]));
      console.log('Full JSON Length:', JSON.stringify(data).length);
    } else {
      console.log('No schedules array found in response');
      console.log(data);
    }
  }
}

async function main() {
  await registerDevice();
  await checkConfig();
}

main();
