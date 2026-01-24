const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function checkPolicies() {
  try {
    await client.connect();
    console.log('Connected to database.');

    const res = await client.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'bell_devices';
    `);

    console.log('\n--- RLS Policies for bell_devices ---');
    if (res.rows.length === 0) {
        console.log('No policies found.');
    } else {
        res.rows.forEach(row => {
            console.log(`Policy: ${row.policyname}`);
            console.log(`  Action: ${row.cmd}`);
            console.log(`  Roles: ${row.roles}`);
            console.log(`  Using: ${row.qual}`);
            console.log('---');
        });
    }

    // Also check if RLS is enabled on the table
    const rlsCheck = await client.query(`
        SELECT relname, relrowsecurity 
        FROM pg_class 
        WHERE relname = 'bell_devices';
    `);
    console.log(`\nRLS Enabled: ${rlsCheck.rows[0]?.relrowsecurity}`);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

checkPolicies();
