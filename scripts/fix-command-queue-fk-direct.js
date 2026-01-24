const { Client } = require('pg');

// Trying direct connection to bypass pooler restrictions/issues
const connectionString = 'postgresql://postgres:Tiger%401979%23%23%23@db.zelpaafberhmslyoegzu.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function fixForeignKey() {
  try {
    await client.connect();
    console.log('Connected to database (Direct).');

    // 1. Drop old constraint
    console.log('Dropping incorrect foreign key constraint...');
    await client.query(`
      ALTER TABLE command_queue 
      DROP CONSTRAINT IF EXISTS command_queue_device_id_fkey;
    `);
    console.log('Constraint dropped.');

    // 2. Add new constraint
    console.log('Adding correct foreign key constraint to bell_devices...');
    await client.query(`
      ALTER TABLE command_queue 
      ADD CONSTRAINT command_queue_device_id_fkey 
      FOREIGN KEY (device_id) 
      REFERENCES bell_devices(id) 
      ON DELETE CASCADE;
    `);
    console.log('New constraint added.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

fixForeignKey();
