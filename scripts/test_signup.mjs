import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://zelpaafberhmslyoegzu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSignup() {
  const email = `signup_test_${Date.now()}@test.com`;
  const password = 'password123';

  console.log(`Signing up as ${email}...`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    console.error('SignUp Failed:', error.message);
  } else {
    console.log('SignUp Success:', data.user.id);
    
    // Try login immediately
    const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (loginError) console.error('Login after Signup Failed:', loginError.message);
    else console.log('Login after Signup Success');
  }
}

testSignup();
