import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkUsersTable() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users'
      `);
      console.log('Columns in users:', res.rows);
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkUsersTable().catch(console.error);
