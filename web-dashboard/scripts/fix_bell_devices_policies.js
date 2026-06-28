import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sql = `
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view devices in their school" ON public.bell_devices;
  DROP POLICY IF EXISTS "Admins can manage devices" ON public.bell_devices;
  DROP POLICY IF EXISTS "Super admin full access bell_devices" ON public.bell_devices;
  DROP POLICY IF EXISTS super_admin_bell_devices_all ON public.bell_devices;
  DROP POLICY IF EXISTS "Everyone can view bell_devices (temp)" ON public.bell_devices;
END $$;

CREATE POLICY "Users can view devices in their school"
ON public.bell_devices
FOR SELECT
TO authenticated
USING (
  school_id = get_my_school_id()
  OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "Admins and super admins manage devices"
ON public.bell_devices
FOR ALL
TO authenticated
USING (
  (
    school_id = get_my_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);
`;

async function main() {
  try {
    console.log('Connecting to database to update bell_devices policies...');
    await client.connect();
    await client.query(sql);
    console.log('bell_devices RLS policies updated successfully.');
  } catch (error) {
    console.error('Error updating bell_devices policies:', error);
  } finally {
    await client.end();
  }
}

main();

