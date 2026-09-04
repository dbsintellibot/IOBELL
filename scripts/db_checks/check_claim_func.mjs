import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(oid)
    FROM pg_proc
    WHERE proname = 'claim_device';
  `);
  console.log('claim_device function definition:');
  console.log(res.rows[0]?.pg_get_functiondef);
  await client.end();
}

main().catch(console.error);
