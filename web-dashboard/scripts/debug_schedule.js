
import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Connected to database.");
    
    // 1. Find user and school
    const email = "digitapbs@gmail.com";
    const userRes = await client.query("SELECT id, school_id, email FROM users WHERE email = $1", [email]);
    
    if (userRes.rows.length === 0) {
      console.log(`User ${email} not found.`);
      return;
    }
    const user = userRes.rows[0];
    console.log("User:", user);

    const schoolRes = await client.query("SELECT * FROM schools WHERE id = $1", [user.school_id]);
    const school = schoolRes.rows[0];
    console.log("School:", school.name, `(${school.id})`);

    // 2. Find devices for this school
    const devicesRes = await client.query("SELECT * FROM bell_devices WHERE school_id = $1", [school.id]);
    console.log(`Found ${devicesRes.rows.length} devices.`);
    devicesRes.rows.forEach(d => {
        console.log(`- Device: ${d.name} (${d.mac_address}) | Profile ID: ${d.profile_id}`);
    });

    // 3. Find profiles for this school
    const profilesRes = await client.query("SELECT * FROM bell_profiles WHERE school_id = $1", [school.id]);
    console.log(`Found ${profilesRes.rows.length} profiles.`);
    
    for (const p of profilesRes.rows) {
        console.log(`- Profile: ${p.name} (${p.id}) | Active: ${p.is_active}`);
        
        // Count bell times for this profile
        const timesRes = await client.query("SELECT COUNT(*) FROM bell_times WHERE profile_id = $1", [p.id]);
        console.log(`  - Bell Times count: ${timesRes.rows[0].count}`);
        
        // Show a few bell times to verify
        const someTimes = await client.query("SELECT bell_time, day_of_week FROM bell_times WHERE profile_id = $1 LIMIT 3", [p.id]);
        console.log("  - Sample times:", someTimes.rows);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
