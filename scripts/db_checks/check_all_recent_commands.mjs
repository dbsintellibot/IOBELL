import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const deviceId = '2eddb8b2-9e17-41a5-958f-56fd73d6fa52';
  try {
    const res = await client.query(`
      SELECT id, command, payload, status, created_at, executed_at 
      FROM public.command_queue 
      WHERE device_id = $1 AND created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY id DESC
    `, [deviceId]);
    console.log('Commands in last 30 minutes:');
    res.rows.forEach(r => {
      console.log(`[${r.created_at.toISOString()}] [Status: ${r.status}] [Exec: ${r.executed_at ? r.executed_at.toISOString() : 'NULL'}] Command: ${r.command} Payload: ${JSON.stringify(r.payload)}`);
    });
  } catch (err) {
    console.error('Error querying commands:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
