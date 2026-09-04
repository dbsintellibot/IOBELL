import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const deviceId = '7fb2fb94-1318-47fe-8498-2cbfe005cbd2';

  // Check command_queue
  const queueRes = await client.query(`
    SELECT * 
    FROM public.command_queue 
    WHERE device_id = $1 
    ORDER BY created_at DESC 
    LIMIT 20
  `, [deviceId]);
  
  console.log('=== Recent Commands in Queue ===');
  console.log(JSON.stringify(queueRes.rows, null, 2));

  // Let's also check if there is a command_log or similar table
  try {
    const logRes = await client.query(`
      SELECT * 
      FROM public.command_logs 
      WHERE device_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `, [deviceId]);
    console.log('\n=== Recent Command Logs ===');
    console.log(JSON.stringify(logRes.rows, null, 2));
  } catch (e) {
    console.log('\nNo public.command_logs table found or error:', e.message);
  }

  await client.end();
}

main().catch(console.error);
