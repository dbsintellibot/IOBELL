import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:67:6C';
  try {
    const res = await client.query('SELECT public.get_device_config($1) as config', [mac]);
    const config = res.rows[0].config;
    console.log('get_device_config top-level keys:');
    const { schedules, ...topLevel } = config;
    console.log(JSON.stringify(topLevel, null, 2));
    console.log(`Number of schedules: ${schedules ? schedules.length : 0}`);
    if (schedules && schedules.length > 0) {
      console.log('First 2 schedules:');
      console.log(JSON.stringify(schedules.slice(0, 2), null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
