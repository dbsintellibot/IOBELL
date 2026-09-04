import pg from 'pg';
const { Client } = pg;

const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0.OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0';

async function main() {
  const schoolId = 'deeb76f3-7d81-41a7-bac7-3ae94732b84b';
  try {
    console.log('Testing Edge Function precombine-schedule for school:', schoolId);
    const response = await fetch('https://hjlwzkwiweocnfztshmy.supabase.co/functions/v1/precombine-schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify({ school_id: schoolId })
    });
    const text = await response.text();
    console.log('Precombine status:', response.status);
    console.log('Precombine response:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
