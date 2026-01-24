const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function updateRegisterRpcLenient() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // DROP FIRST because we are changing return signature
    await client.query(`DROP FUNCTION IF EXISTS register_device_from_esp(text, text, text);`);

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
        status text,
        message text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        v_school_id uuid;
        v_device_id uuid;
        v_current_school_id uuid;
        v_message text := 'OK';
      BEGIN
        -- 1. Find School ID from Code (if provided)
        IF p_school_code IS NOT NULL AND p_school_code <> '' THEN
            SELECT schools.id INTO v_school_id FROM schools WHERE schools.school_code = p_school_code;
            
            -- LENIENT MODE: If code is invalid, don't crash. Just treat as Unassigned.
            IF v_school_id IS NULL THEN
                v_message := 'Warning: Invalid School Code provided. Device set to Unassigned.';
                -- v_school_id remains NULL
            END IF;
        ELSE
            v_school_id := NULL;
        END IF;

        -- 2. Check if device exists
        SELECT bell_devices.id, bell_devices.school_id INTO v_device_id, v_current_school_id 
        FROM bell_devices 
        WHERE bell_devices.mac_address = p_mac_address;

        IF v_device_id IS NOT NULL THEN
          -- Device exists.
          -- Logic for school_id:
          --   If v_school_id IS FOUND (valid code provided), update to that school.
          --   If v_school_id IS NULL (empty request OR invalid code), KEEP EXISTING school_id (don't unassign existing device just because of a bad/empty code).
          
          UPDATE bell_devices 
          SET 
            name = COALESCE(p_device_name, bell_devices.name),
            school_id = COALESCE(v_school_id, bell_devices.school_id), 
            status = 'online',
            updated_at = now()
          WHERE bell_devices.id = v_device_id;
          
        ELSE
          -- Insert new device
          INSERT INTO bell_devices (school_id, name, mac_address, status)
          VALUES (v_school_id, p_device_name, p_mac_address, 'online')
          RETURNING bell_devices.id INTO v_device_id;
        END IF;

        -- 3. Return details
        RETURN QUERY 
        SELECT d.id, d.school_id, s.school_code, d.name, d.status, v_message
        FROM bell_devices d
        LEFT JOIN schools s ON d.school_id = s.id
        WHERE d.id = v_device_id;
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION register_device_from_esp(text, text, text) TO anon;
      GRANT EXECUTE ON FUNCTION register_device_from_esp(text, text, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION register_device_from_esp(text, text, text) TO service_role;
    `;

    await client.query(sql);
    console.log('RPC function register_device_from_esp updated to be LENIENT.');

    // Fix schema to allow unassigned devices (Plug & Play)
    await client.query(`ALTER TABLE public.bell_devices ALTER COLUMN school_id DROP NOT NULL;`);
    console.log('Fixed schema: bell_devices.school_id is now nullable.');

  } catch (e) {
    console.error('Error updating RPC:', e);
  } finally {
    await client.end();
  }
}

updateRegisterRpcLenient();
