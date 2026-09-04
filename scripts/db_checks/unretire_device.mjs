import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = 'AC:A7:04:12:6C:98';
  console.log('Un-retiring and resetting inventory for device:', mac);

  try {
    await client.query('BEGIN');

    // 1. Reset retired status and claim info in device_inventory
    const updateInvRes = await client.query(`
      UPDATE public.device_inventory
      SET retired_at = NULL,
          retired_reason = NULL,
          claimed_at = NULL,
          claimed_by_school_id = NULL
      WHERE mac_address ILIKE $1
      RETURNING *;
    `, [mac]);
    
    console.log('Updated device_inventory row:', updateInvRes.rows);

    // 2. Delete any existing bell_devices entry for this MAC to prevent duplicate key constraint when claiming
    const deleteBellRes = await client.query(`
      DELETE FROM public.bell_devices
      WHERE mac_address ILIKE $1
      RETURNING *;
    `, [mac]);

    console.log('Deleted bell_devices row(s):', deleteBellRes.rows);

    await client.query('COMMIT');
    console.log('Successfully un-retired and cleared unassigned state for device!');

    // Final verification check
    console.log('\n--- VERIFICATION ---');
    const invCheck = await client.query('SELECT * FROM public.device_inventory WHERE mac_address ILIKE $1', [mac]);
    console.log('device_inventory record:', invCheck.rows[0]);

    const bellCheck = await client.query('SELECT * FROM public.bell_devices WHERE mac_address ILIKE $1', [mac]);
    console.log('bell_devices count:', bellCheck.rows.length);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to update device:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
