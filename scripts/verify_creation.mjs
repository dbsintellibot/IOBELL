import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

// Hardcoded for simplicity in this context (copy from .env.local)
const SUPABASE_URL = "https://zelpaafberhmslyoegzu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verify() {
  console.log('--- Starting Verification ---');

  // 1. Login as Super Admin
  const superAdminEmail = 'muddasirh@gmail.com';
  const superAdminPassword = 'password123';
  
  console.log(`Logging in as Super Admin (${superAdminEmail})...`);
  const { data: saData, error: saError } = await supabase.auth.signInWithPassword({
    email: superAdminEmail,
    password: superAdminPassword
  });

  if (saError) {
    console.error('Super Admin Login Failed:', saError.message);
    process.exit(1);
  }
  console.log('Super Admin Logged in.');

  // Test another existing user
  const existingEmail = 'admin@lincoln.edu';
  const existingPass = 'password123';
  console.log(`Logging in as Existing User (${existingEmail})...`);
  const { error: existError } = await supabase.auth.signInWithPassword({
    email: existingEmail,
    password: existingPass
  });
  if (existError) {
      console.log('Existing User Login Failed:', existError.message);
  } else {
      console.log('Existing User Login Success');
  }

  // 2. Create New School Admin
  // Re-login as Super Admin to ensure we have the right permissions
  console.log(`Re-logging in as Super Admin...`);
  await supabase.auth.signInWithPassword({
    email: superAdminEmail,
    password: superAdminPassword
  });

  const newEmail = `factory_test_${Date.now()}@test.com`;
  const newPassword = 'password123';
  const schoolName = `Factory ${Date.now()}`;

  console.log(`Creating School Admin: ${newEmail} for ${schoolName}...`);
  const { data: createData, error: createError } = await supabase.rpc('create_school_admin', {
    email_input: newEmail,
    password_input: newPassword,
    school_name_input: schoolName
  });

  if (createError) {
    console.error('Create User Failed:', createError.message);
    process.exit(1);
  }
  console.log('User Created Successfully:', createData);

  // 3. Login as New User
  console.log(`Logging in as New User (${newEmail})...`);
  
  // We need a new client or sign out
  await supabase.auth.signOut();
  
  const { data: userData, error: userError } = await supabase.auth.signInWithPassword({
    email: newEmail,
    password: newPassword
  });

  if (userError) {
    console.error('New User Login Failed:', userError.message);
    process.exit(1);
  }
  console.log('New User Logged in.');
  console.log('User Role:', userData.user.role); // Should be authenticated

  // 4. Verify Public User Role & School
  console.log('Verifying Public User Profile...');
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userData.user.id)
    .single();

  if (profileError) {
    console.error('Fetch Profile Failed:', profileError.message);
  } else {
    console.log('Profile:', profile);
    if (profile.role !== 'admin') console.error(`FAIL: Role is ${profile.role}, expected admin`);
    else console.log('PASS: Role is admin');

    if (!profile.school_id) console.error('FAIL: No School ID assigned');
    else console.log(`PASS: School ID assigned: ${profile.school_id}`);

    // 5. Test Bell Profile Creation (RLS Check)
    console.log('Testing Bell Profile Creation...');
    const { data: bellProfile, error: bellError } = await supabase
        .from('bell_profiles')
        .insert({
            name: 'Regular Shift',
            school_id: profile.school_id
        })
        .select()
        .single();
    
    if (bellError) {
        console.error('FAIL: Create Bell Profile:', bellError.message);
    } else {
        console.log('PASS: Created Bell Profile:', bellProfile.name);
    }

    // 6. Test Audio File Metadata Creation (RLS Check)
    console.log('Testing Audio File Metadata Creation...');
    const { data: audioFile, error: audioError } = await supabase
        .from('audio_files')
        .insert({
            name: 'bell.mp3',
            storage_path: `${profile.school_id}/bell.mp3`,
            school_id: profile.school_id
        })
        .select()
        .single();
    
    if (audioError) {
        console.error('FAIL: Create Audio File Metadata:', audioError.message);
    } else {
        console.log('PASS: Created Audio File Metadata:', audioFile.name);
    }

  }

  console.log('--- Verification Complete ---');
}

verify();
