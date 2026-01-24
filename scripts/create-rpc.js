const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function createRpc() {
  try {
    await client.connect();
    console.log('Connected to database.');

    const sql = `
      DROP FUNCTION IF EXISTS get_device_config(text);
      
      CREATE OR REPLACE FUNCTION get_device_config(mac_addr text)
      RETURNS SETOF bell_devices
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        RETURN QUERY SELECT * FROM bell_devices WHERE mac_address = mac_addr;
      END;
      $$;

      GRANT EXECUTE ON FUNCTION get_device_config(text) TO anon;
      GRANT EXECUTE ON FUNCTION get_device_config(text) TO authenticated;
      GRANT EXECUTE ON FUNCTION get_device_config(text) TO service_role;
    `;

    await client.query(sql);
    console.log('RPC function get_device_config created successfully.');

  } catch (e) {
    console.error('Error creating RPC:', e);
  } finally {
    await client.end();
  }
}

createRpc();
