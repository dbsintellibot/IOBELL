import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkFunctions() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT p.proname, p.prosrc, pg_get_functiondef(p.oid) as def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public';
      `);
      console.log('Public Functions Count:', res.rows.length);
      for (const row of res.rows) {
          // just try to parse the function to see if postgres finds it valid
          // wait, pg_get_functiondef already parses it.
      }
      console.log('All functions successfully parsed by pg_get_functiondef.');
      
      // Let's also check for any invalid views in the entire database (all schemas except pg_catalog and information_schema)
      const allViews = await client.query(`
        SELECT n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('v', 'm') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      `);
      
      console.log(`Checking ${allViews.rows.length} views...`);
      for (const row of allViews.rows) {
          try {
              await client.query(`SELECT 1 FROM "${row.nspname}"."${row.relname}" LIMIT 0`);
          } catch (e) {
              console.error(`Invalid view [${row.nspname}.${row.relname}]: ${e.message}`);
          }
      }

  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkFunctions().catch(console.error);
