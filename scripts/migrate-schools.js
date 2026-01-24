const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function migrateSchools() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Add column if not exists
    await client.query(`
      ALTER TABLE public.schools 
      ADD COLUMN IF NOT EXISTS school_code text UNIQUE;
    `);
    console.log('Added school_code column.');

    // 2. Populate for Lincoln High School specifically
    await client.query(`
      UPDATE public.schools 
      SET school_code = '11111' 
      WHERE id = '11111111-1111-1111-1111-111111111111';
    `);
    console.log('Updated Lincoln High School code to 11111.');

    // 3. Populate random 5-digit codes for others
    // We use a simple loop or a fancy query. A query is better but we need uniqueness.
    // For now, let's just generate random ones.
    const res = await client.query("SELECT id FROM public.schools WHERE school_code IS NULL");
    for (const row of res.rows) {
      const code = Math.floor(10000 + Math.random() * 90000).toString();
      try {
        await client.query("UPDATE public.schools SET school_code = $1 WHERE id = $2", [code, row.id]);
        console.log(`Updated school ${row.id} with code ${code}`);
      } catch (e) {
        console.log(`Failed to update ${row.id} (collision?), skipping...`);
      }
    }

    // 4. Update get_device_config RPC to return school_code
    // We need to drop and recreate it to change the return type.
    // Actually, it returns SETOF bell_devices. bell_devices is a table/view.
    // If we want to return school_code, we need to join or include it.
    // bell_devices table doesn't have school_code.
    // We should probably modify the RPC to return a custom type or JSON.

    await client.query(`
      DROP FUNCTION IF EXISTS get_device_config(text);
      
      CREATE OR REPLACE FUNCTION get_device_config(mac_addr text)
      RETURNS TABLE (
        id uuid,
        school_id uuid,
        school_code text,
        name text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        RETURN QUERY 
        SELECT d.id, d.school_id, s.school_code, d.name
        FROM bell_devices d
        JOIN schools s ON d.school_id = s.id
        WHERE d.mac_address = mac_addr;
      END;
      $$;

      GRANT EXECUTE ON FUNCTION get_device_config(text) TO anon;
      GRANT EXECUTE ON FUNCTION get_device_config(text) TO authenticated;
      GRANT EXECUTE ON FUNCTION get_device_config(text) TO service_role;
    `);
    console.log('Updated get_device_config RPC.');

    // 5. Create RPC for syncing schedules by CODE
    await client.query(`
        CREATE OR REPLACE FUNCTION get_profile_by_code(code text)
        RETURNS uuid
        LANGUAGE sql
        SECURITY DEFINER
        AS $$
          SELECT id FROM bell_profiles 
          WHERE school_id = (SELECT id FROM schools WHERE school_code = code)
          LIMIT 1;
        $$;
        
        GRANT EXECUTE ON FUNCTION get_profile_by_code(text) TO anon;
        GRANT EXECUTE ON FUNCTION get_profile_by_code(text) TO authenticated;
        GRANT EXECUTE ON FUNCTION get_profile_by_code(text) TO service_role;
    `);
    console.log('Created get_profile_by_code RPC.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

migrateSchools();
