const { Client } = require('pg');

// Hardcoded for reliability in this specific run
const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function fixSuperAdminPolicy() {
  try {
    await client.connect();
    console.log('Connected to database.');

    console.log('Creating RLS policy for Super Admins on command_queue...');
    
    // Allow Super Admins to INSERT/SELECT/UPDATE/DELETE anything in command_queue
    await client.query(`
      DROP POLICY IF EXISTS "Super admins all command_queue" ON command_queue;
      
      CREATE POLICY "Super admins all command_queue" 
      ON command_queue 
      FOR ALL 
      TO authenticated 
      USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
      )
      WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
      );
    `);
    
    console.log('Super Admin policy created successfully.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

fixSuperAdminPolicy();
