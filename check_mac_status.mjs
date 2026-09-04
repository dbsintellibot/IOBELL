import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'E8:F6:0A:4E:E4:A0';
  console.log(`=== Querying Device with MAC: ${mac} ===`);

  const devRes = await client.query('SELECT * FROM public.bell_devices WHERE mac_address = $1', [mac]);
  console.log('DEVICE_ROW:', devRes.rows);

  if (devRes.rows.length > 0 && devRes.rows[0].school_id) {
    const schRes = await client.query('SELECT * FROM public.schools WHERE id = $1', [devRes.rows[0].school_id]);
    console.log('SCHOOL_ROW:', schRes.rows);
  }

  const allDevs = await client.query('SELECT id, mac_address, name, status, school_id, last_heartbeat, board_type FROM public.bell_devices ORDER BY last_heartbeat DESC LIMIT 10');
  console.log('RECENT_DEVICES:', allDevs.rows);

  await client.end();
}

main().catch(console.error);
