import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  console.log('--- Schools ---');
  // Check if HBS exists
  const resSchools = await client.query("SELECT id, name FROM schools WHERE name ILIKE '%Hassan%'");
  console.table(resSchools.rows);

  if (resSchools.rows.length > 0) {
      const hbs = resSchools.rows[0];
      console.log(`\nFound School: ${hbs.name} (ID: ${hbs.id})`);
      
      // Check profiles for this school
      const resProfiles = await client.query('SELECT id, name FROM bell_profiles WHERE school_id = $1', [hbs.id]);
      console.log('Profiles:');
      console.table(resProfiles.rows);

      // Check devices for this school
      const resDevices = await client.query('SELECT id, name, mac_address FROM bell_devices WHERE school_id = $1', [hbs.id]);
      console.log('Devices:');
      console.table(resDevices.rows);
      
      if (resDevices.rows.length === 0) {
          console.log('WARNING: No devices found for this school!');
          console.log('To fix this, we need to register the device D4:E9:F4:A3:F4:B8.');
      }

      // Check schedules for profiles
      for (const p of resProfiles.rows) {
          const resCount = await client.query('SELECT count(*) FROM bell_times WHERE profile_id = $1', [p.id]);
          console.log(`Profile ${p.name}: ${resCount.rows[0].count} schedules`);
      }
  } else {
      console.log('School "Hassan Bin Sabit" not found.');
  }

  await client.end();
}

async function testRPC(mac) { }

run();
