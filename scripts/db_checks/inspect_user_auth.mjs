import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const email = 'dbstrovear@gmail.com';

  const authUser = await client.query('SELECT * FROM auth.users WHERE LOWER(email) = LOWER($1)', [email]);
  console.log('auth.users full record:');
  console.dir(authUser.rows[0], { depth: null });

  const pubUser = await client.query('SELECT * FROM public.users WHERE LOWER(email) = LOWER($1)', [email]);
  console.log('\npublic.users full record:');
  console.dir(pubUser.rows[0], { depth: null });

  await client.end();
}

main().catch(console.error);
