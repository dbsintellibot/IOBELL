import pg from 'pg';
import fs from 'fs';

const envContent = fs.readFileSync('web-dashboard/.env.local', 'utf8');
const match = envContent.match(/DATABASE_URL=\"(.*)\"/);
const connectionString = match ? match[1] : '';

const client = new pg.Client({ connectionString });

async function run() {
  await client.connect();
  const res1 = await client.query('SELECT id, name, pre_announcement_enabled, default_pre_announcement_id, pre_announcement_delay_seconds FROM schools');
  console.log('Schools:', res1.rows);
  const res2 = await client.query("SELECT public.get_device_config('AC:A7:04:12:67:6C')");
  console.log('Device Config Output:', JSON.stringify(res2.rows[0].get_device_config, null, 2));
  await client.end();
}

run().catch(console.error);
