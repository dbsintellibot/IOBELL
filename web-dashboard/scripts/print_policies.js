import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);
    console.log("--- RLS Policies in 'public' schema ---");
    for (const row of res.rows) {
      console.log(`\nTable: ${row.tablename} | Policy: ${row.policyname} | Command: ${row.cmd}`);
      console.log(`Roles: ${JSON.stringify(row.roles)} | Permissive: ${row.permissive}`);
      console.log(`USING (qual): ${row.qual}`);
      if (row.with_check) {
        console.log(`WITH CHECK: ${row.with_check}`);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
