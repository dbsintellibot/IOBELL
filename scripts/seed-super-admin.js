const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // Enable pgcrypto for password hashing
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    const email = 'muddasirh@gmail.com';
    const password = 'password123';

    await client.query('BEGIN');

    // 1. Generate Hashed Password
    const { rows: [pwRow] } = await client.query(`SELECT crypt($1, gen_salt('bf')) as hash`, [password]);
    const hashedPassword = pwRow.hash;

    // 2. Check if user exists in auth.users
    const { rows: [existingUser] } = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    
    let userId;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`User ${email} exists (ID: ${userId}). Updating password...`);
      await client.query('UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2', [hashedPassword, userId]);
    } else {
      console.log(`Creating new user ${email}...`);
      const { rows: [newUser] } = await client.query(`
        INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          last_sign_in_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at,
          confirmation_token,
          email_change,
          email_change_token_new,
          recovery_token
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000',
          gen_random_uuid(),
          'authenticated',
          'authenticated',
          $1,
          $2,
          now(),
          now(),
          '{"provider": "email", "providers": ["email"]}',
          '{}',
          now(),
          now(),
          '',
          '',
          '',
          ''
        )
        RETURNING id
      `, [email, hashedPassword]);
      userId = newUser.id;
    }

    // 3. Ensure user is in public.users and is super_admin
    const { rows: [publicUser] } = await client.query('SELECT id FROM public.users WHERE id = $1', [userId]);
    
    if (!publicUser) {
      console.log('Adding user to public.users...');
      await client.query("INSERT INTO public.users (id, role, full_name) VALUES ($1, 'super_admin', 'Super Admin')", [userId]);
    } else {
      console.log('Updating user role to super_admin...');
      await client.query("UPDATE public.users SET role = 'super_admin' WHERE id = $1", [userId]);
    }

    // 4. Demote other super_admins
    console.log('Demoting other super_admins...');
    const { rowCount } = await client.query("UPDATE public.users SET role = 'admin' WHERE role = 'super_admin' AND id != $1", [userId]);
    console.log(`Demoted ${rowCount} other super admins.`);

    await client.query('COMMIT');
    console.log('Seed completed successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error seeding super admin:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
