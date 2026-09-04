import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  console.log('Querying all schools...');
  const res = await client.query(`SELECT * FROM public.schools ORDER BY created_at DESC`);

  console.log(`Found ${res.rows.length} schools:`);
  console.dir(res.rows, { depth: null });

  await client.end();
}

main().catch(console.error);
