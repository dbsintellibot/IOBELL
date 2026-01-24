const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function listInfo() {
  try {
    await client.connect();
    console.log('Connected to database.');

    console.log('\n--- Tables in Public Schema ---');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    tables.rows.forEach(row => console.log(row.table_name));

    console.log('\n--- Schools ---');
    const schools = await client.query('SELECT * FROM public.schools');
    if (schools.rows.length === 0) {
      console.log('No schools found.');
    } else {
      schools.rows.forEach(school => {
        console.log(`ID: ${school.id}, Name: ${school.name}, Timezone: ${school.timezone}`);
      });
    }

    console.log('\n--- Bell Devices ---');
    const bellDevices = await client.query('SELECT * FROM public.bell_devices');
    if (bellDevices.rows.length === 0) {
      console.log('No bell_devices found.');
    } else {
      bellDevices.rows.forEach(device => {
        console.log(`ID: ${device.id}, School ID: ${device.school_id}, MAC: ${device.mac_address}`);
      });
    }

  } catch (e) {
    console.error('Error listing info:', e);
  } finally {
    await client.end();
  }
}

listInfo();
