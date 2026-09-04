import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:67:6C';
  try {
    const deviceRes = await client.query('SELECT * FROM public.bell_devices WHERE UPPER(mac_address) = UPPER($1)', [mac]);
    if (deviceRes.rows.length === 0) {
      console.log('Device not found!');
      return;
    }
    const device = deviceRes.rows[0];
    const deviceId = device.id;
    console.log('Device details:');
    console.log(`- ID: ${device.id}`);
    console.log(`- Name: ${device.device_name}`);
    console.log(`- Firmware Version: ${device.firmware_version}`);
    console.log(`- Last Seen: ${device.last_seen}`);
    console.log(`- Status: ${device.status}`);
    console.log('-------------------------------------------');

    const cmdRes = await client.query(`
      SELECT id, command, payload, status, created_at, executed_at 
      FROM public.command_queue 
      WHERE device_id = $1 
      ORDER BY id DESC
      LIMIT 5
    `, [deviceId]);
    console.log('Recent commands:');
    cmdRes.rows.forEach(r => {
      console.log(`[ID: ${r.id}] [Created: ${r.created_at.toISOString()}] [Status: ${r.status}] [Exec: ${r.executed_at ? r.executed_at.toISOString() : 'NULL'}] Command: ${r.command}`);
      console.log(`Payload: ${JSON.stringify(r.payload, null, 2)}`);
      console.log('-------------------------------------------');
    });

    const logsRes = await client.query(`
      SELECT level, message, created_at 
      FROM public.device_logs 
      WHERE device_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at ASC
    `, [deviceId]);
    console.log('Device logs for the past hour:');
    logsRes.rows.forEach(row => {
      console.log(`[${row.created_at.toISOString()}] [${row.level}] ${row.message}`);
    });
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
