const pg = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../web-dashboard/.env.local') });

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');

    const res = await client.query(`
      SELECT id, name, mac_address, status, last_heartbeat, school_id 
      FROM public.bell_devices 
      ORDER BY last_heartbeat DESC NULLS LAST;
    `);

    console.table(res.rows);

  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await client.end();
  }
}

run();
