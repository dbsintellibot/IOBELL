const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function createRegisterRpc() {
  try {
    await client.connect();
    console.log('Connected to database.');

    const sql = `
      CREATE OR REPLACE FUNCTION register_device_from_esp(
        p_mac_address text,
        p_school_code text,
        p_device_name text
      )
      RETURNS TABLE (
        id uuid,
        school_id uuid,
        school_code text,
        name text,
        status text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        v_school_id uuid;
        v_device_id uuid;
      BEGIN
        -- 1. Find School ID from Code
        SELECT schools.id INTO v_school_id FROM schools WHERE schools.school_code = p_school_code;
        
        IF v_school_id IS NULL THEN
          RAISE EXCEPTION 'Invalid School Code: %', p_school_code;
        END IF;

        -- 2. Check if device exists
        SELECT bell_devices.id INTO v_device_id FROM bell_devices WHERE bell_devices.mac_address = p_mac_address;

        IF v_device_id IS NOT NULL THEN
          -- Device exists, update name if changed? Or just return it.
          -- Let's update the name and school if they changed (allow moving schools easily)
          UPDATE bell_devices 
          SET name = p_device_name, school_id = v_school_id, updated_at = now()
          WHERE bell_devices.id = v_device_id;
        ELSE
          -- Insert new device
          INSERT INTO bell_devices (school_id, name, mac_address, status)
          VALUES (v_school_id, p_device_name, p_mac_address, 'online')
          RETURNING bell_devices.id INTO v_device_id;
        END IF;

        -- 3. Return details
        RETURN QUERY 
        SELECT d.id, d.school_id, s.school_code, d.name, d.status
        FROM bell_devices d
        JOIN schools s ON d.school_id = s.id
        WHERE d.id = v_device_id;
      END;
      $$;

      GRANT EXECUTE ON FUNCTION register_device_from_esp(text, text, text) TO anon;
      GRANT EXECUTE ON FUNCTION register_device_from_esp(text, text, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION register_device_from_esp(text, text, text) TO service_role;
    `;

    await client.query(sql);
    console.log('RPC function register_device_from_esp created successfully.');

  } catch (e) {
    console.error('Error creating RPC:', e);
  } finally {
    await client.end();
  }
}

createRegisterRpc();
