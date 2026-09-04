import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const emails = ['digitapbs@gmail.com', 'dbstrovear@gmail.com'];

  for (const email of emails) {
    console.log(`\n========================================`);
    console.log(`RECORD FOR: ${email}`);
    const authUser = await client.query('SELECT * FROM auth.users WHERE LOWER(email) = LOWER($1)', [email]);
    console.log('auth.users:', JSON.stringify(authUser.rows[0], null, 2));

    const pubUser = await client.query('SELECT * FROM public.users WHERE LOWER(email) = LOWER($1)', [email]);
    console.log('public.users:', JSON.stringify(pubUser.rows[0], null, 2));
  }

  await client.end();
}

main().catch(console.error);
