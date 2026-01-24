const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function inspectSchools() {
  try {
    await client.connect();
    console.log('Connected to database.');

    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'schools';
    `);

    console.log('\n--- Schools Table Schema ---');
    res.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} (${row.is_nullable})`);
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

inspectSchools();
