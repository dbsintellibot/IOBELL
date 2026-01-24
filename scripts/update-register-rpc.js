const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function updateRegisterRpc() {
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
        v_current_school_id uuid;
      BEGIN
        -- 1. Find School ID from Code (if provided)
        IF p_school_code IS NOT NULL AND p_school_code <> '' THEN
            SELECT schools.id INTO v_school_id FROM schools WHERE schools.school_code = p_school_code;
            IF v_school_id IS NULL THEN
                -- If a specific code was requested but not found, we could error, 
                -- OR we could treat it as "Unassigned" but warn. 
                -- For now, let's allow it to be Unassigned if code is invalid, 
                -- or stick to strict check?
                -- Strict check seems safer for "Assigning". 
                -- But for "Auto Connect", if user types wrong code, they get error.
                RAISE EXCEPTION 'Invalid School Code: %', p_school_code;
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
          -- Update name and status.
          -- Logic for school_id:
          --   If v_school_id IS PROVIDED (NOT NULL), update to that school.
          --   If v_school_id IS NULL (empty request), KEEP EXISTING school_id (don't unassign on reboot).
          
          UPDATE bell_devices 
          SET 
            name = COALESCE(p_device_name, name),
            school_id = COALESCE(v_school_id, school_id), -- Only update if new one provided
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
        -- We need LEFT JOIN on schools because school_id might be NULL
        RETURN QUERY 
        SELECT d.id, d.school_id, s.school_code, d.name, d.status
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
    console.log('RPC function register_device_from_esp updated successfully.');

  } catch (e) {
    console.error('Error updating RPC:', e);
  } finally {
    await client.end();
  }
}

updateRegisterRpc();
