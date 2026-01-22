const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = 'https://zelpaafberhmslyoegzu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8';
const SCHOOL_ID = '00000000-0000-0000-0000-000000000000'; // Dummy ID for testing

// Create TWO clients to simulate distinct devices
const listenerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log(`[Test] Starting Realtime Verification for School: ${SCHOOL_ID}`);

  // 1. Setup Listener (Simulates ESP32 or another client)
  const listenerChannel = listenerClient.channel(`school:${SCHOOL_ID}`);
  
  listenerChannel
    .on('broadcast', { event: '*' }, (payload) => {
      console.log(`[Listener] Received Broadcast: ${payload.event}`);
      console.log(`[Listener] Payload:`, JSON.stringify(payload.payload, null, 2));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Listener] Subscribed to channel.');
        
        // Trigger tests after subscription
        setTimeout(runTests, 1000);
      }
    });

  // 2. Sender Logic (Simulates Mobile App)
  const senderChannel = senderClient.channel(`school:${SCHOOL_ID}`);
  senderChannel.subscribe(); // Need to subscribe to send? Usually yes.

  async function runTests() {
    // Wait a bit for sender to be ready
    
    console.log('\n[Sender] Simulating Manual Trigger...');
    await senderChannel.send({
      type: 'broadcast',
      event: 'manual_ring',
      payload: { 
        audio_url: 'https://example.com/bell.mp3',
        duration: 5,
        name: 'Test Bell' 
      },
    });

    setTimeout(async () => {
      console.log('\n[Sender] Simulating Emergency Trigger...');
      await senderChannel.send({
        type: 'broadcast',
        event: 'emergency',
        payload: { 
          message: 'EMERGENCY TRIGGERED',
          timestamp: new Date().toISOString()
        },
      });
    }, 2000);

    setTimeout(async () => {
      console.log('\n[Sender] Simulating Profile Switch...');
      await senderChannel.send({
        type: 'broadcast',
        event: 'profile_change',
        payload: { 
          profile_id: 'profile-123',
          profile_name: 'Half Day' 
        },
      });
    }, 4000);
    
    setTimeout(() => {
        console.log('\n[Test] Verification Complete. Exiting...');
        listenerClient.removeChannel(listenerChannel);
        senderClient.removeChannel(senderChannel);
        process.exit(0);
    }, 6000);
  }
}

main();
