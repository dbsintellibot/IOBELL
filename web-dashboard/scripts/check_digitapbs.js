import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runCheck() {
  const email = 'digitapbs@gmail.com';
  console.log(`--- Checking User Account: ${email} ---`);
  
  const client = await pool.connect();
  try {
    // 1. Check in public.users
    const publicRes = await client.query(
      'SELECT id, email, role, school_id, created_at FROM public.users WHERE email = $1',
      [email]
    );
    if (publicRes.rows.length === 0) {
      console.log(`❌ NOT FOUND in public.users`);
      return;
    }

    console.log(`✅ FOUND in public.users:`);
    console.table(publicRes.rows);
    
    const user = publicRes.rows[0];
    const schoolId = user.school_id;
    
    if (schoolId) {
      console.log(`\n--- School Details (School ID: ${schoolId}) ---`);
      const schoolRes = await client.query('SELECT * FROM public.schools WHERE id = $1', [schoolId]);
      if (schoolRes.rows.length === 0) {
        console.log(`❌ School ID ${schoolId} not found in public.schools!`);
      } else {
        console.table(schoolRes.rows);
      }

      // Check bell profiles
      console.log(`\n--- Bell Profiles for School ---`);
      const profileRes = await client.query('SELECT * FROM public.bell_profiles WHERE school_id = $1', [schoolId]);
      console.log(`Found ${profileRes.rows.length} bell profiles.`);
      if (profileRes.rows.length > 0) {
        console.table(profileRes.rows);
        
        // Check bell times for these profiles
        const profileIds = profileRes.rows.map(p => p.id);
        console.log(`\n--- Bell Times for these profiles ---`);
        const timesRes = await client.query(
          'SELECT bt.id, bt.profile_id, bp.name as profile_name, bt.bell_time, bt.day_of_week, bt.audio_file_id ' +
          'FROM public.bell_times bt ' +
          'JOIN public.bell_profiles bp ON bt.profile_id = bp.id ' +
          'WHERE bp.school_id = $1',
          [schoolId]
        );
        console.log(`Found ${timesRes.rows.length} bell times.`);
        if (timesRes.rows.length > 0) {
          console.table(timesRes.rows);
        }
      }

      // Check audio files
      console.log(`\n--- Audio Files for School ---`);
      const audioRes = await client.query('SELECT * FROM public.audio_files WHERE school_id = $1', [schoolId]);
      console.log(`Found ${audioRes.rows.length} audio files.`);
      if (audioRes.rows.length > 0) {
        console.table(audioRes.rows);
      }

      // Check devices
      console.log(`\n--- Bell Devices for School ---`);
      const deviceRes = await client.query('SELECT * FROM public.bell_devices WHERE school_id = $1', [schoolId]);
      console.log(`Found ${deviceRes.rows.length} devices.`);
      if (deviceRes.rows.length > 0) {
        console.table(deviceRes.rows);
      }
    } else {
      console.log(`⚠️ User has no school_id assigned.`);
    }
  } catch (err) {
    console.error(`Error executing queries:`, err);
  } finally {
    client.release();
    await pool.end();
  }
}

runCheck();
