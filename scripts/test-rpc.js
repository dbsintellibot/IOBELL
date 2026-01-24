const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zelpaafberhmslyoegzu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
  const mac = 'A4:AF:5B:E3:42:A8';
  const code = '11111';
  const name = 'Test Bell from Script';

  console.log(`Testing RPC register_device_from_esp...`);
  console.log(`MAC: ${mac}, Code: ${code}, Name: ${name}`);

  const { data, error } = await supabase.rpc('register_device_from_esp', {
    p_mac_address: mac,
    p_school_code: code,
    p_device_name: name
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success:', data);
  }
}

testRpc();
