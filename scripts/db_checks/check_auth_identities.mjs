import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const userIds = [
    'e3674e44-da64-4f11-b10b-38fe00a4c1db', // digitapbs (WORKING)
    '20ab9558-8c4d-4d5c-a8f1-f19d43efdcc9'  // dbstrovear (FAILING 500)
  ];

  for (const uid of userIds) {
    console.log(`\nChecking auth.identities for user_id: ${uid}`);
    const res = await client.query('SELECT * FROM auth.identities WHERE user_id = $1', [uid]);
    console.log(`Count: ${res.rows.length}`);
    console.dir(res.rows, { depth: null });
  }

  await client.end();
}

main().catch(console.error);
