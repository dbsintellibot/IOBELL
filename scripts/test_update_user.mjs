import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function testUpdate() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Get the latest user ID
    const res = await client.query(`SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1`);
    const userId = res.rows[0].id;
    console.log('Testing update on user:', userId);

    // Try to update last_sign_in_at
    await client.query(`
      UPDATE auth.users 
      SET last_sign_in_at = NOW() 
      WHERE id = $1
    `, [userId]);
    
    console.log('Update successful');

  } catch (err) {
    console.error('Update failed:', err);
  } finally {
    await client.end();
  }
}

testUpdate();
