import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const schoolIds = [
    'e00cc773-65c7-4537-9775-1d944d0617d1', // BAHRIA DEFENCE CAMPUS
    'ac618114-fc5a-4db2-bcd3-83f53b8947b0'  // BAHRIA Gulshan Campus
  ];

  for (const sid of schoolIds) {
    console.log(`\n========================================`);
    console.log(`Checking School ID: ${sid}`);
    const school = await client.query('SELECT * FROM public.schools WHERE id = $1', [sid]);
    console.log('School details:', school.rows[0]);

    const users = await client.query('SELECT id, email, role, school_id FROM public.users WHERE school_id = $1', [sid]);
    console.log('Linked users in public.users:', users.rows);

    const devices = await client.query('SELECT id, name, mac_address FROM public.bell_devices WHERE school_id = $1', [sid]);
    console.log('Linked bell_devices:', devices.rows);

    const profiles = await client.query('SELECT id, name FROM public.bell_profiles WHERE school_id = $1', [sid]);
    console.log('Linked bell_profiles:', profiles.rows);

    const audio = await client.query('SELECT id, name FROM public.audio_files WHERE school_id = $1', [sid]);
    console.log('Linked audio_files:', audio.rows);

    const inv = await client.query('SELECT id, mac_address, claimed_by_school_id FROM public.device_inventory WHERE claimed_by_school_id = $1', [sid]);
    console.log('Claimed device_inventory rows:', inv.rows);
  }

  await client.end();
}

main().catch(console.error);
