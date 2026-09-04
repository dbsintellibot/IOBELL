import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name, p.proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgisinternal = false
    ORDER BY schema_name, table_name;
  `);

  console.log('All non-internal triggers in DB:');
  console.dir(res.rows, { depth: null });

  await client.end();
}

main().catch(console.error);
