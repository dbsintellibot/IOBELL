import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:6C:98';

  console.log('Checking bell_devices...');
  const bellDevs = await client.query('SELECT * FROM public.bell_devices WHERE mac_address ILIKE $1', [mac]);
  console.log('bell_devices count:', bellDevs.rows.length);
  console.dir(bellDevs.rows, { depth: null });

  console.log('Checking device_inventory...');
  const invDevs = await client.query('SELECT * FROM public.device_inventory WHERE mac_address ILIKE $1', [mac]);
  console.log('device_inventory count:', invDevs.rows.length);
  console.dir(invDevs.rows, { depth: null });

  await client.end();
}

main().catch(console.error);
