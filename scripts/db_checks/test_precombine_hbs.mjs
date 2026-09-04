import fs from 'fs';

async function main() {
  const envContent = fs.readFileSync('web-dashboard/.env.local', 'utf8');
  let url = '';
  let anonKey = '';
  for (const line of envContent.split('\n')) {
    if (line.trim().startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
    if (line.trim().startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim().replace(/"/g, '');
  }

  const schoolId = '7a17637a-b5f1-44a2-b9d9-f254393c7074';
  try {
    console.log(`Triggering precombine-schedule edge function for school ${schoolId}...`);
    const response = await fetch(`${url}/functions/v1/precombine-schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify({ school_id: schoolId })
    });
    const text = await response.text();
    console.log('Status code:', response.status);
    console.log('Response body:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
