import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:67:6C';
  try {
    console.log('Querying device with MAC:', mac);
    const deviceRes = await client.query('SELECT * FROM public.bell_devices WHERE UPPER(mac_address) = UPPER($1)', [mac]);
    if (deviceRes.rows.length === 0) {
      console.log('Device not found!');
      return;
    }
    const device = deviceRes.rows[0];
    console.log('Device found:', JSON.stringify(device, null, 2));

    const schoolId = device.school_id;
    console.log('School ID:', schoolId);

    const schoolRes = await client.query('SELECT * FROM public.schools WHERE id = $1', [schoolId]);
    console.log('School:', JSON.stringify(schoolRes.rows[0], null, 2));

    const audioRes = await client.query('SELECT * FROM public.audio_files WHERE school_id = $1', [schoolId]);
    console.log('Audio Files count:', audioRes.rows.length);
    console.log('Audio Files:', JSON.stringify(audioRes.rows, null, 2));

    const profilesRes = await client.query('SELECT * FROM public.bell_profiles WHERE school_id = $1', [schoolId]);
    console.log('Bell Profiles:', JSON.stringify(profilesRes.rows, null, 2));

    for (const profile of profilesRes.rows) {
      const timesRes = await client.query('SELECT * FROM public.bell_times WHERE profile_id = $1', [profile.id]);
      console.log(`Bell Times for Profile "${profile.name}":`, JSON.stringify(timesRes.rows, null, 2));
    }
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
