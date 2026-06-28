
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
    
    // Check schedules for Profile Normal (f63bbf2c-dbfe-4d01-94ba-a698ce5bbe6c)
    const profileId = 'f63bbf2c-dbfe-4d01-94ba-a698ce5bbe6c';
    
    const res = await client.query("SELECT bell_time, day_of_week FROM bell_times WHERE profile_id = $1 ORDER BY bell_time", [profileId]);
    console.table(res.rows);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
