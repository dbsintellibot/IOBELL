import fs from 'fs';

async function main() {
  const envContent = fs.readFileSync('web-dashboard/.env.local', 'utf8');
  let url = '';
  let anonKey = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim().replace(/"/g, '');
  }

  const email = 'dbstrovear@gmail.com';
  const password = 'AutoBell2026!';

  console.log(`Testing auth signIn for ${email}...`);
  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  const json = await resp.json();
  console.log('HTTP Status:', resp.status);
  console.log('User ID in token response:', json.user?.id);
  console.log('Access Token acquired?:', !!json.access_token);
}

main().catch(console.error);
