import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE confrelid = 'public.schools'::regclass;
  `);
  console.log('FK definitions referencing schools:');
  console.dir(res.rows, { depth: null });
  await client.end();
}

main().catch(console.error);
