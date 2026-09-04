import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function main() {
  const envContent = fs.readFileSync('web-dashboard/.env.local', 'utf8');
  let url = '';
  let anonKey = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim().replace(/"/g, '');
  }

  console.log('Testing auth signIn with URL:', url);
  const client = createClient(url, anonKey);

  const email = 'muddasirh@gmail.com';
  const passwordsToTry = ['AutoBell2026!', 'digitapbs2026!', 'AutoBell2025!', 'digitapbs2025!'];

  for (const password of passwordsToTry) {
    console.log(`Trying sign in for ${email} with password: "${password}"`);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      console.log(`❌ Failed: ${error.message}`);
    } else {
      console.log(`✅ Success! Authenticated user ID: ${data.user.id}`);
      break;
    }
  }
}

main().catch(console.error);
