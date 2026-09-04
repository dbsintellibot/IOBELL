import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:6C:98';
  console.log('Searching for MAC:', mac);
  
  const bellDevs = await client.query('SELECT * FROM public.bell_devices WHERE mac_address ILIKE $1', [mac]);
  console.log('--- BELL_DEVICES ---');
  console.dir(bellDevs.rows, { depth: null });

  const invDevs = await client.query('SELECT * FROM public.device_inventory WHERE mac_address ILIKE $1', [mac]);
  console.log('--- DEVICE_INVENTORY ---');
  console.dir(invDevs.rows, { depth: null });

  // Let's also check if there's any serial number or other MAC variations
  const invAll = await client.query('SELECT * FROM public.device_inventory WHERE mac_address ILIKE $1 OR serial_number ILIKE $1', [`%${mac}%`]);
  console.log('--- DEVICE_INVENTORY SEARCH LIKE ---');
  console.dir(invAll.rows, { depth: null });

  await client.end();
}

main().catch(console.error);
