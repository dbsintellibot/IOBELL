
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
    
    const profileId = 'f63bbf2c-dbfe-4d01-94ba-a698ce5bbe6c';
    const time = '02:35:00';
    
    console.log(`Checking for schedule at ${time} for profile ${profileId}...`);
    
    const res = await client.query(
        "SELECT * FROM bell_times WHERE profile_id = $1 AND bell_time = $2", 
        [profileId, time]
    );
    
    if (res.rows.length > 0) {
        console.log("FOUND IT:", res.rows[0]);
    } else {
        console.log("NOT FOUND! It seems it was not inserted or deleted.");
        
        // Try to insert again?
        // Or check count
        const countRes = await client.query("SELECT COUNT(*) FROM bell_times WHERE profile_id = $1", [profileId]);
        console.log("Total schedules:", countRes.rows[0].count);
    }
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
