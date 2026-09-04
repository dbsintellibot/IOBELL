import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const email = 'dbstrovear@gmail.com';
  
  const authUser = await client.query('SELECT id, email, role, instance_id, aud, confirmed_at FROM auth.users WHERE LOWER(email) = LOWER($1)', [email]);
  console.log('auth.users:', authUser.rows);

  const pubUser = await client.query('SELECT id, email, role, school_id FROM public.users WHERE LOWER(email) = LOWER($1)', [email]);
  console.log('public.users:', pubUser.rows);

  // Let's also check all users in auth.users and public.users
  const allAuth = await client.query('SELECT id, email, role FROM auth.users');
  console.log('ALL auth.users:', allAuth.rows);

  const allPub = await client.query('SELECT id, email, role, school_id FROM public.users');
  console.log('ALL public.users:', allPub.rows);

  await client.end();
}

main().catch(console.error);
