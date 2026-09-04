import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const schoolId = 'deeb76f3-7d81-41a7-bac7-3ae94732b84b';
  try {
    const schoolRes = await client.query('SELECT pre_announcement_enabled, default_pre_announcement_id, pre_announcement_delay_seconds FROM schools WHERE id = $1', [schoolId]);
    console.log('School settings:', schoolRes.rows[0]);

    const pasRes = await client.query('SELECT * FROM pre_announcement_sounds');
    console.log('Pre announcement sounds:', pasRes.rows);

    const timesRes = await client.query(`
      SELECT bt.id, bt.bell_time, bt.play_type, bt.tts_message, bt.include_weather, bt.audio_file_id, bt.profile_id
      FROM bell_times bt
      JOIN bell_profiles bp ON bt.profile_id = bp.id
      WHERE bp.school_id = $1
    `, [schoolId]);
    console.log('Bell times:', timesRes.rows);

    // Test fetching chimeUrl if any
    const defaultPasId = schoolRes.rows[0]?.default_pre_announcement_id;
    if (defaultPasId) {
      const soundRes = await client.query('SELECT * FROM pre_announcement_sounds WHERE id = $1', [defaultPasId]);
      console.log('Default chime sound row:', soundRes.rows);
      if (soundRes.rows.length > 0) {
        const chimeUrl = soundRes.rows[0].file_url;
        console.log('Fetching chimeUrl:', chimeUrl);
        try {
          const res = await fetch(chimeUrl);
          console.log('Chime fetch status:', res.status, res.statusText);
        } catch (e) {
          console.error('Chime fetch failed:', e.message);
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
