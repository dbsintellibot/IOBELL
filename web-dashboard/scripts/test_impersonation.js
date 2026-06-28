import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const userId = 'c0d0e624-acfb-4491-a911-c15468fcd6b9';
  console.log(`--- Testing RLS Impersonation for User ID: ${userId} ---`);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      SELECT 
        set_config('request.jwt.claims', $1, true),
        set_config('role', 'authenticated', true)
    `, [JSON.stringify({ sub: userId, role: 'authenticated' })]);

    const uidRes = await client.query('SELECT auth.uid() as current_uid');
    console.log(`auth.uid(): ${uidRes.rows[0].current_uid}`);

    try {
      const roleRes = await client.query('SELECT public.get_my_role() as role, public.get_my_school_id() as school_id');
      console.log(`get_my_role(): ${roleRes.rows[0].role}`);
      console.log(`get_my_school_id(): ${roleRes.rows[0].school_id}`);
    } catch (e) {
      console.error(`Error calling helper functions:`, e.message);
    }

    // 1. Query public.users (Own profile)
    try {
      const userRes = await client.query('SELECT id, email, role, school_id FROM public.users');
      console.log(`Users returned: ${userRes.rows.length}`);
      console.log(JSON.stringify(userRes.rows));
    } catch (e) {
      console.error(`Error querying users table:`, e.message);
    }

    // 2. Query public.schools
    try {
      const schoolRes = await client.query('SELECT id, name FROM public.schools');
      console.log(`Schools returned: ${schoolRes.rows.length}`);
      console.log(JSON.stringify(schoolRes.rows));
    } catch (e) {
      console.error(`Error querying schools table:`, e.message);
    }

    // 3. Query public.bell_profiles
    try {
      const profileRes = await client.query('SELECT id, name, school_id FROM public.bell_profiles');
      console.log(`Profiles returned: ${profileRes.rows.length}`);
      console.log(JSON.stringify(profileRes.rows));
    } catch (e) {
      console.error(`Error querying bell_profiles table:`, e.message);
    }

    // 4. Query public.bell_devices
    try {
      const deviceRes = await client.query('SELECT id, name, school_id, status FROM public.bell_devices');
      console.log(`Devices returned: ${deviceRes.rows.length}`);
      console.log(JSON.stringify(deviceRes.rows));
    } catch (e) {
      console.error(`Error querying bell_devices table:`, e.message);
    }

    await client.query('ROLLBACK');
  } catch (err) {
    console.error("General Transaction Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
