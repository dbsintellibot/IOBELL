import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const mac = '1C:DB:D4:4B:0B:48';
  let output = '';

  function log(msg, data = '') {
    const formatted = msg + (data ? '\n' + JSON.stringify(data, null, 2) : '') + '\n';
    output += formatted;
    console.log(msg, data);
  }

  log(`=== Auditing Device: ${mac} ===`);
  
  // 1. Get device details
  const deviceRes = await client.query('SELECT * FROM public.bell_devices WHERE mac_address = $1', [mac]);
  if (deviceRes.rows.length === 0) {
    log(`Device with MAC ${mac} not found in public.bell_devices!`);
    fs.writeFileSync('device_audit_output.txt', output);
    await client.end();
    return;
  }
  const device = deviceRes.rows[0];
  log('Device info:', device);

  // 2. Get school details
  const schoolRes = await client.query('SELECT * FROM public.schools WHERE id = $1', [device.school_id]);
  const school = schoolRes.rows[0];
  log('School info:', school);

  // 3. Get assigned/active profiles
  const profilesRes = await client.query('SELECT * FROM public.bell_profiles WHERE school_id = $1', [device.school_id]);
  log(`Profiles for school ${device.school_id}:`, profilesRes.rows);

  // 4. Get active profile bell times
  const activeProfile = device.profile_id || (profilesRes.rows.find(p => p.is_active) || {}).id;
  log(`Active Profile ID being used: ${activeProfile}`);
  if (activeProfile) {
    const timesRes = await client.query('SELECT * FROM public.bell_times WHERE profile_id = $1 ORDER BY bell_time ASC', [activeProfile]);
    log(`Bell Times for Active Profile (${activeProfile}):`, timesRes.rows);
  } else {
    log('No active profile found for school/device.');
  }

  // 5. Check if there are any specific database functions or RPCs we can call to see what config is returned to the device.
  try {
    const configRes = await client.query('SELECT * FROM public.get_device_config($1)', [mac]);
    log('Result of get_device_config RPC:', configRes.rows);
  } catch (err) {
    log('Error calling get_device_config: ' + err.message);
  }

  fs.writeFileSync('device_audit_output.txt', output);
  await client.end();
}

main().catch(console.error);
