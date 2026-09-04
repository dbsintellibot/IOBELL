import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkSchema() {
  await client.connect();
  
  try {
      // Check for invalid views
      console.log('--- Checking for invalid views ---');
      const viewsRes = await client.query(`
        SELECT c.relname, c.relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      `);
      
      for (const row of viewsRes.rows) {
          try {
              await client.query(`SELECT * FROM public."${row.relname}" LIMIT 0`);
          } catch (e) {
              console.error(`Invalid view: ${row.relname} - ${e.message}`);
          }
      }
      
      console.log('--- Checking for functions that fail to parse ---');
      // Some functions might have search_path issues, but we can't easily parse them all.
      // But we can check if PostgREST reports errors in its schema cache.
      const postgrestLog = await client.query(`
        -- In some versions of postgrest, we can query its internal state, but usually not.
        -- Let's just try to query via PostgREST directly using HTTP.
        SELECT 1;
      `);
      
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkSchema().catch(console.error);
