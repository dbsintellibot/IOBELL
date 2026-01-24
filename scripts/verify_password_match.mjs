import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function verifyHash() {
  try {
    await client.connect();
    
    const email = 'factory_test_1769088335691@test.com';
    const password = 'password123';

    const res = await client.query(`
      SELECT 
        id, 
        encrypted_password,
        (encrypted_password = crypt($1, encrypted_password)) as match
      FROM auth.users
      WHERE email = $2
    `, [password, email]);
    
    console.log('Password Match Check:', res.rows[0]);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

verifyHash();
