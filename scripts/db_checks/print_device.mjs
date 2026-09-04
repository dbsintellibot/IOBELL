import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:67:6C';
  try {
    const deviceRes = await client.query('SELECT id, mac_address, name, school_id, status FROM public.bell_devices WHERE UPPER(mac_address) = UPPER($1)', [mac]);
    console.log('Devices:', deviceRes.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
