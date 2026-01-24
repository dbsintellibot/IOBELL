const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function fixSchemaAndPolicy() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Add school_id column if not exists
    console.log('Adding school_id column to command_queue...');
    await client.query(`
      ALTER TABLE command_queue 
      ADD COLUMN IF NOT EXISTS school_id UUID; -- REFERENCES schools(id) is good practice but let's stick to simple first or check if schools exists
    `);
    console.log('Column added (if not existed).');

    // 2. Add RLS Policy
    // We drop existing policy if we want to replace, or just create a new one.
    // Let's create a specific one for admins.
    
    console.log('Creating RLS policy for School Admins...');
    // Drop it first to avoid "already exists" error if we re-run
    await client.query(`DROP POLICY IF EXISTS "School admins insert command_queue" ON command_queue;`);
    
    await client.query(`
      CREATE POLICY "School admins insert command_queue" 
      ON command_queue 
      FOR INSERT 
      TO authenticated 
      WITH CHECK (
        -- User must have a school_id
        -- The inserted school_id must match the user's school_id
        -- The device must belong to that school (optional but good for security)
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND school_id = command_queue.school_id
        )
        AND
        EXISTS (
            SELECT 1 FROM bell_devices
            WHERE id = command_queue.device_id
            AND school_id = command_queue.school_id
        )
      );
    `);
    console.log('Insert Policy created.');

    // View policy
    await client.query(`DROP POLICY IF EXISTS "School admins view command_queue" ON command_queue;`);
    await client.query(`
      CREATE POLICY "School admins view command_queue" 
      ON command_queue 
      FOR SELECT 
      TO authenticated 
      USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND school_id = command_queue.school_id
        )
      );
    `);
    console.log('Select Policy created.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

fixSchemaAndPolicy();
