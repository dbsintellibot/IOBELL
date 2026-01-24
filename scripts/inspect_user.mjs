import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function inspectUser() {
  try {
    await client.connect();
    console.log('Connected to database');

    const res = await client.query(`
      SELECT *
      FROM auth.users
      WHERE email = 'muddasirh@gmail.com';
    `);
    
    console.log('Users:', JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

inspectUser();
