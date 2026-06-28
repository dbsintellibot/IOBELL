import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const schoolId = '36478a82-b4e1-481d-a535-d8e831b54695';
    
    // Check profiles
    const profiles = await client.query('SELECT * FROM public.bell_profiles WHERE school_id = $1', [schoolId]);
    console.log(`\n--- Bell Profiles (${profiles.rows.length} found) ---`);
    console.table(profiles.rows);

    if (profiles.rows.length > 0) {
      const profileIds = profiles.rows.map(p => p.id);
      
      // Check bell times
      const times = await client.query(`
        SELECT bt.id, bt.profile_id, bt.bell_time, bt.day_of_week, bt.audio_file_id, af.name as audio_name
        FROM public.bell_times bt
        LEFT JOIN public.audio_files af ON bt.audio_file_id = af.id
        WHERE bt.profile_id = ANY($1)
        ORDER BY bt.bell_time
      `, [profileIds]);
      console.log(`\n--- Bell Times (${times.rows.length} found) ---`);
      console.table(times.rows);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
