import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkHooks() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT p.proname, n.nspname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname ILIKE '%hook%' OR p.proname ILIKE '%jwt%';
      `);
      console.log('Hooks or JWT functions:', res.rows);
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkHooks().catch(console.error);
