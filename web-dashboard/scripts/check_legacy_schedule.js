
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
    const schoolId = '36478a82-b4e1-481d-a535-d8e831b54695'; // Jamia Hassan Bin Sabit
    
    // Check bell_schedules (Legacy?)
    // Need to see if bell_schedules has a school_id or linked via profile?
    // Based on previous `inspect_bell_tables.js`, `bell_schedules` has `profile_id`.
    
    // Get all profile IDs for this school (we know there is only 1: f63bbf2c...)
    const profileId = 'f63bbf2c-dbfe-4d01-94ba-a698ce5bbe6c';

    console.log(`Checking bell_schedules for profile ${profileId}...`);
    const legacyRes = await client.query("SELECT * FROM bell_schedules WHERE profile_id = $1", [profileId]);
    console.log(`Found ${legacyRes.rows.length} entries in bell_schedules.`);
    
    if (legacyRes.rows.length > 0) {
        console.log("Sample legacy data:", legacyRes.rows.slice(0, 3));
    }

    // Check if there are other profiles in bell_schedules that might belong to this school but are not in bell_profiles table? 
    // Unlikely if referential integrity is there.
    
    // Maybe there are other profiles for this school that I missed?
    // I did `SELECT * FROM bell_profiles WHERE school_id = ...` and found only 1.

  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
