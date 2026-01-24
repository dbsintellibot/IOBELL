import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({ connectionString });

async function check() {
  await client.connect();
  const res = await client.query("select nspname from pg_extension e join pg_namespace n on e.extnamespace = n.oid where extname = 'pgcrypto'");
  console.log(res.rows);
  await client.end();
}

check();
