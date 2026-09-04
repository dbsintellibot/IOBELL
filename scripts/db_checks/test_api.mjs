async function testApi() {
  const supabaseUrl = 'https://hjlwzkwiweocnfztshmy.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0.OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0';

  const res = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': 'Bearer ' + anonKey
    }
  });
  
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

testApi().catch(console.error);
