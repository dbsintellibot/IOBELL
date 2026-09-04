import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const allIdentities = await client.query('SELECT id, user_id, provider_id, provider, email FROM auth.identities');
  console.log('ALL auth.identities:');
  console.dir(allIdentities.rows, { depth: null });

  await client.end();
}

main().catch(console.error);
