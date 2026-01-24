const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function registerDevice() {
  const mac = 'A4:AF:5B:E3:42:A8';
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const name = 'Main Bell';

  try {
    await client.connect();
    console.log('Connected to database.');

    // Check if device exists
    const res = await client.query('SELECT * FROM public.bell_devices WHERE mac_address = $1', [mac]);
    if (res.rows.length > 0) {
      console.log(`Device ${mac} already exists with ID: ${res.rows[0].id}`);
      return;
    }

    // Try inserting into devices table first (assuming bell_devices is a view)
    try {
        console.log('Attempting to insert into public.devices...');
        const insertRes = await client.query(
            'INSERT INTO public.devices (school_id, name, mac_address, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [schoolId, name, mac, 'offline']
        );
        console.log(`Device registered in devices table with ID: ${insertRes.rows[0].id}`);
    } catch (err) {
        console.log('Insert into devices failed, trying bell_devices...');
        // If devices table fails or doesn't exist, try bell_devices directly
        const insertRes = await client.query(
            'INSERT INTO public.bell_devices (school_id, name, mac_address, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [schoolId, name, mac, 'offline']
        );
        console.log(`Device registered in bell_devices table with ID: ${insertRes.rows[0].id}`);
    }

  } catch (e) {
    console.error('Error registering device:', e);
  } finally {
    await client.end();
  }
}

registerDevice();
