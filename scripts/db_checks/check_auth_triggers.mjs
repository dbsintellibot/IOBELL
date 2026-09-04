import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkAuthTriggers() {
  await client.connect();
  
  try {
      console.log('--- Checking triggers on auth.users ---');
      const triggersRes = await client.query(`
        SELECT tgname, proname 
        FROM pg_trigger
        JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
        JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
        WHERE pg_class.relname = 'users' AND pg_class.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')
      `);
      console.log(triggersRes.rows);

      // Let's also check if any function in public schema is invalid by trying to execute plpgsql_check if available
      try {
          const checkRes = await client.query(`
              SELECT proname, plpgsql_check_function(oid) 
              FROM pg_proc 
              WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
                AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
          `);
          console.log(checkRes.rows);
      } catch (e) {
          console.log('plpgsql_check not available or failed:', e.message);
      }
      
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkAuthTriggers().catch(console.error);
