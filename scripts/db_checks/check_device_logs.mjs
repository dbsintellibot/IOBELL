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
      SELECT level, message, created_at 
      FROM public.device_logs 
      WHERE device_id = $1 AND created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC 
      LIMIT 50
    `, [deviceId]);
    console.log('Recent Device Logs:');
    res.rows.forEach(row => {
      console.log(`[${row.created_at.toISOString()}] [${row.level}] ${row.message}`);
    });
  } catch (err) {
    console.error('Error querying logs:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
