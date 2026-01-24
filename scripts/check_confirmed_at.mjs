import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function checkConfirmedAt() {
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT column_name, is_generated, generation_expression
      FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'confirmed_at';
    `);
    
    console.log('ConfirmedAt Column:', res.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

checkConfirmedAt();
