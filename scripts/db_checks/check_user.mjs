import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkUser() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT u.id, u.email, pu.role, pu.school_id 
        FROM auth.users u
        LEFT JOIN public.users pu ON u.id = pu.id
        WHERE u.email = 'digitapbs@gmail.com'
      `);
      console.log('User check:', res.rows);
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkUser().catch(console.error);
