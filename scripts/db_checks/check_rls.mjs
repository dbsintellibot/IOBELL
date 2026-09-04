import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkRLS() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT tablename, policyname, roles, cmd, qual, with_check 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'users'
      `);
      console.log('Policies for users:', res.rows);
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkRLS().catch(console.error);
