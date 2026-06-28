
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
    
    // Check columns of audio_files
    const schemaRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'audio_files'");
    const columns = schemaRes.rows.map(r => r.column_name);
    // console.log("audio_files Columns:", columns);

    // 1. Find the school
    const email = "digitapbs@gmail.com";
    const userRes = await client.query("SELECT school_id FROM users WHERE email = $1", [email]);
    if (userRes.rows.length === 0) { console.log("User not found"); return; }
    const schoolId = userRes.rows[0].school_id;
    console.log("School ID:", schoolId);

    // 2. Find the active profile
    let profilesRes = await client.query("SELECT id, name FROM bell_profiles WHERE school_id = $1 AND is_active = true", [schoolId]);
    if (profilesRes.rows.length === 0) {
        profilesRes = await client.query("SELECT id, name FROM bell_profiles WHERE school_id = $1", [schoolId]);
    }
    const profile = profilesRes.rows[0];
    console.log(`Using Profile: ${profile.name} (${profile.id})`);

    // 3. Find a valid Audio File
    let audioQuery = "SELECT id, track_number FROM audio_files WHERE school_id = $1 LIMIT 1";
    if (columns.includes('filename')) {
        audioQuery = "SELECT id, filename, track_number FROM audio_files WHERE school_id = $1 LIMIT 1";
    } else if (columns.includes('name')) {
        audioQuery = "SELECT id, name, track_number FROM audio_files WHERE school_id = $1 LIMIT 1";
    }
    
    const audioRes = await client.query(audioQuery, [schoolId]);
    
    let audioFileId = null;
    if (audioRes.rows.length > 0) {
        audioFileId = audioRes.rows[0].id;
        const name = audioRes.rows[0].filename || audioRes.rows[0].name || "Unknown";
        console.log(`Using Audio File: ${name} (Track: ${audioRes.rows[0].track_number})`);
    } else {
        console.log("No audio files found! Cannot create schedule without audio file.");
        return;
    }

    // 4. Insert 2:35 AM Schedule
    const time = "02:35:00";
    const days = [1, 2, 3, 4, 5, 6, 7]; // All days
    
    const checkRes = await client.query("SELECT id FROM bell_times WHERE profile_id = $1 AND bell_time = $2", [profile.id, time]);
    
    if (checkRes.rows.length > 0) {
        console.log(`Schedule for ${time} already exists (ID: ${checkRes.rows[0].id}). Updating days and audio...`);
        await client.query(
            "UPDATE bell_times SET day_of_week = $1, audio_file_id = $2 WHERE id = $3", 
            [days, audioFileId, checkRes.rows[0].id]
        );
        console.log("Updated existing schedule.");
    } else {
        const insertRes = await client.query(
            `INSERT INTO bell_times (profile_id, bell_time, day_of_week, audio_file_id, play_type) 
             VALUES ($1, $2, $3, $4, 'mp3') RETURNING id`,
            [profile.id, time, days, audioFileId]
        );
        console.log(`Successfully inserted schedule for ${time} with ID: ${insertRes.rows[0].id}`);
    }

    // 5. IMMEDIATE VERIFICATION
    const verifyRes = await client.query("SELECT * FROM bell_times WHERE profile_id = $1 AND bell_time = $2", [profile.id, time]);
    if (verifyRes.rows.length > 0) {
        console.log("VERIFICATION SUCCESS: Schedule is present in DB.");
        console.log(verifyRes.rows[0]);
    } else {
        console.error("VERIFICATION FAILED: Schedule was not found after insertion!");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
