import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkConnectivity() {
  const email = 'dbsintellibot@gmail.com';
  console.log(`--- Database Connectivity Diagnostic ---`);
  console.log(`Connecting to: ${connectionString.split('@')[1]}`);
  console.log(`Checking user: ${email}\n`);

  const client = await pool.connect();
  try {
    // 1. Check basic connection
    const timeRes = await client.query('SELECT NOW() as current_time');
    console.log(`✅ Connection Successful!`);
    console.log(`Database Time: ${timeRes.rows[0].current_time}`);

    // 2. Check for user in public.users
    const userRes = await client.query(
      'SELECT id, email, role, school_id, tts_enabled, created_at FROM public.users WHERE email = $1',
      [email]
    );

    if (userRes.rows.length > 0) {
      console.log(`\n✅ User Found in public.users:`);
      console.table(userRes.rows);
      
      const schoolId = userRes.rows[0].school_id;
      if (schoolId) {
        const schoolRes = await client.query('SELECT name FROM public.schools WHERE id = $1', [schoolId]);
        if (schoolRes.rows.length > 0) {
          console.log(`School Name: ${schoolRes.rows[0].name}`);
        }
      }
    } else {
      console.log(`\n❌ User '${email}' NOT found in public.users table.`);
    }

    // 3. Check auth.users (if possible, though usually restricted)
    try {
      const authRes = await client.query('SELECT id, email, email_confirmed_at FROM auth.users WHERE email = $1', [email]);
      if (authRes.rows.length > 0) {
        console.log(`\n✅ User Found in auth.users:`);
        console.table(authRes.rows);
      } else {
        console.log(`\n❌ User '${email}' NOT found in auth.users table.`);
      }
    } catch (e) {
      console.log(`\n⚠️ Note: Could not query auth.users (likely permission restricted).`);
    }

  } catch (err) {
    console.error(`\n❌ Database Connectivity Error:`, err.message);
  } finally {
    client.release();
    await pool.end();
    console.log(`\n--- Diagnostic Complete ---`);
  }
}

checkConnectivity();
