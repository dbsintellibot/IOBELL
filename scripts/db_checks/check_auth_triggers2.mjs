import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkTrigger() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT pg_get_triggerdef(t.oid) as def
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE t.tgname = 'on_auth_user_created' AND n.nspname = 'auth';
      `);
      console.log('Trigger def:', res.rows[0].def);

      // Check if there are other triggers on auth.identities or auth.sessions or other auth tables
      const otherRes = await client.query(`
        SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) as def
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'auth' AND t.tgname NOT LIKE 'RI_ConstraintTrigger%' AND t.tgname NOT LIKE 'pg_sync%'
      `);
      console.log('Other Auth Triggers:', otherRes.rows);

  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkTrigger().catch(console.error);
