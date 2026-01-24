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

    const sql = `
      CREATE OR REPLACE FUNCTION update_heartbeat(p_device_id uuid, p_status text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        UPDATE public.bell_devices
        SET 
          last_heartbeat = now(),
          status = p_status
        WHERE id = p_device_id;
      END;
      $$;
    `;

    await client.query(sql);
    console.log('Function update_heartbeat deployed successfully');
  } catch (err) {
    console.error('Error deploying function:', err);
  } finally {
    await client.end();
  }
}

run();
