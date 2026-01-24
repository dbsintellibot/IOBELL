import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function checkTrigger() {
  try {
    await client.connect();
    console.log('Connected to database');

    const res = await client.query(`
      SELECT 
        trigger_name, 
        event_manipulation, 
        event_object_schema, 
        event_object_table, 
        action_statement 
      FROM information_schema.triggers 
      WHERE event_object_table = 'users' 
      AND event_object_schema = 'public';
    `);
    
    console.log('Triggers on public.users:', res.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

checkTrigger();
