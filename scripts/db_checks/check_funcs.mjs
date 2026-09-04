import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkFunctions() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname IN ('get_my_role', 'get_my_school_id', 'is_super_admin');
      `);
      console.log('Functions:', res.rows);
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkFunctions().catch(console.error);
