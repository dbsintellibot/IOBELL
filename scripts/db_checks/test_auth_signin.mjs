import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hjlwzkwiweocnfztshmy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MTc3ODEsImV4cCI6MjA2NzA5Mzc4MX0.O9E_q-90_P_qW2zH4R3P5P8L5A2W5Q5Q5Q5Q5Q5Q5Q5'; // let's check anon key from web-dashboard

async function main() {
  // Let's read env from web-dashboard/.env.local if available
  const fs = await import('fs');
  const envContent = fs.readFileSync('web-dashboard/.env.local', 'utf8');
  let url = '';
  let anonKey = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim().replace(/"/g, '');
  }

  console.log('Testing auth signIn with URL:', url);
  const client = createClient(url, anonKey);

  const email = 'dbstrovear@gmail.com';
  // Try sign in with a sample password or incorrect password to see the exact error response from Supabase
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: 'WrongPassword123!'
  });

  console.log('SignIn Response Data:', data);
  console.log('SignIn Response Error:', error);
}

main().catch(console.error);
