import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const deviceId = 'addbe722-7dc5-404e-ac57-acb4c72bd006';

  const logs = await client.query('SELECT count(*) FROM public.device_logs WHERE device_id = $1', [deviceId]);
  console.log('device_logs count:', logs.rows[0].count);

  const cmds = await client.query('SELECT count(*) FROM public.command_queue WHERE device_id = $1', [deviceId]);
  console.log('command_queue count:', cmds.rows[0].count);

  await client.end();
}

main().catch(console.error);
