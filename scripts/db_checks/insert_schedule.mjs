import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const profileId = '45c9b237-471c-4bfe-8821-a2201d22f1e8'; // active Ramzan profile
  const bellTime = '20:30:00';
  const dayOfWeek = [2]; // Tuesday
  const audioFileId = '9d6af106-a4f1-4b3b-a65e-02d7a77361f5'; // Bell.mp3
  
  try {
    console.log('Inserting bell_time schedule...');
    const insertRes = await client.query(`
      INSERT INTO public.bell_times (profile_id, bell_time, day_of_week, audio_file_id, play_type, include_weather, label, delay_seconds)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [profileId, bellTime, dayOfWeek, audioFileId, 'mp3', false, 'Scheduled 8:30 PM Bell', 0]);
    
    console.log('Successfully inserted schedule:', insertRes.rows[0]);
  } catch (err) {
    console.error('Error inserting schedule:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
