import pg from 'pg';

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    await client.query('DROP POLICY IF EXISTS super_admin_device_inventory_all ON public.device_inventory;');
    await client.query(
      "CREATE POLICY super_admin_device_inventory_all ON public.device_inventory FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));"
    );

    await client.query('DROP POLICY IF EXISTS super_admin_bell_devices_all ON public.bell_devices;');
    await client.query(
      "CREATE POLICY super_admin_bell_devices_all ON public.bell_devices FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));"
    );

    console.log('Super admin policies updated');

    // Backfill bell_devices from device_inventory for claimed, non-retired inventory
    const result = await client.query(`
      INSERT INTO public.bell_devices (mac_address, name, status, school_id)
      SELECT
        i.mac_address,
        COALESCE(
          'Bell-' || NULLIF(i.serial_number, ''),
          'Bell-' || LEFT(i.mac_address, 8)
        ) AS name,
        'offline' AS status,
        i.claimed_by_school_id
      FROM public.device_inventory AS i
      LEFT JOIN public.bell_devices AS b
        ON b.mac_address = i.mac_address
      WHERE
        i.claimed_at IS NOT NULL
        AND i.retired_at IS NULL
        AND b.id IS NULL;
    `);

    console.log('Backfilled bell_devices rows:', result.rowCount);
  } catch (err) {
    console.error('Error updating policies:', err);
  } finally {
    await client.end();
  }
}

main();

