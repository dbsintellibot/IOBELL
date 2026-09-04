import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT * FROM auth.identities');
  for (const row of res.rows) {
    console.log(`\nEmail: ${row.email}`);
    console.dir(row, { depth: null });
  }
  await client.end();
}

main().catch(console.error);
