const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Try to read .env.local manually since dotenv might not be installed
let envConfig = {};
try {
  const envPath = path.resolve(__dirname, '../web-dashboard/.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      // Simple parsing
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, ''); // Remove quotes
        if (key && value && !key.startsWith('#')) {
          envConfig[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.warn('Could not read .env.local:', e.message);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envConfig.VITE_SUPABASE_URL || 'https://zelpaafberhmslyoegzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envConfig.SUPABASE_SERVICE_ROLE_KEY || process.argv[3];

if (!SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required.');
  console.log('Usage: node scripts/create-super-admin.js <email> <service_role_key>');
  console.log('Or set SUPABASE_SERVICE_ROLE_KEY in web-dashboard/.env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function promoteUser(email) {
  console.log(`Promoting user ${email} to super_admin...`);
  
  // First, check if the user exists
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError.message);
    return;
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    console.error(`User with email ${email} not found in Auth. Please sign up first.`);
    return;
  }

  // Call the RPC function
  const { error } = await supabase.rpc('setup_super_admin', { p_email: email });
  
  if (error) {
    console.error('Error promoting user:', error.message);
  } else {
    console.log(`Success! User ${email} is now a super_admin.`);
  }
}

const email = process.argv[2];
if (!email) {
  console.log('Usage: node scripts/create-super-admin.js <email> [service_key]');
  process.exit(1);
}

promoteUser(email);
