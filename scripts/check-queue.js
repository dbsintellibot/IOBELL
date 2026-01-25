
require('dotenv').config({ path: './web-dashboard/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCommandQueue() {
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@lincoln.edu',
    password: 'password123'
  });

  console.log('Checking recent commands (last 10)...');
  const { data: commands, error } = await supabase
    .from('command_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
      console.error('Error fetching commands:', error);
      return;
  }

  commands.forEach(cmd => {
      console.log(`[${cmd.created_at}] ID: ${cmd.id} | Cmd: ${cmd.command} | Executed: ${cmd.executed_at ? 'YES' : 'NO'} | Status: ${cmd.status}`);
  });
}

checkCommandQueue();
