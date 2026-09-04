import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function checkUser() {
  await client.connect();
  
  try {
      console.log('--- public.users ---');
      const publicRes = await client.query(`
        SELECT id, email, role, school_id
        FROM public.users
        WHERE email = 'digitapbs@gmail.com'
      `);
      console.log(publicRes.rows);

      console.log('--- auth.users ---');
      const authRes = await client.query(`
        SELECT id, email, role, raw_app_meta_data, raw_user_meta_data, is_sso_user
        FROM auth.users
        WHERE email = 'digitapbs@gmail.com'
      `);
      console.log(authRes.rows);
      
      console.log('--- auth.identities ---');
      const idRes = await client.query(`
        SELECT id, provider, user_id, identity_data
        FROM auth.identities
        WHERE user_id = $1
      `, [authRes.rows[0]?.id]);
      console.log(idRes.rows);

  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

checkUser().catch(console.error);
