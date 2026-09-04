import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const uid = '20ab9558-8c4d-4d5c-a8f1-f19d43efdcc9';
  const authTables = ['mfa_factors', 'sessions', 'refresh_tokens', 'flow_state', 'sso_providers', 'sso_domains', 'saml_providers', 'one_time_tokens'];

  for (const t of authTables) {
    try {
      const res = await client.query(`SELECT count(*) FROM auth.${t} WHERE user_id = $1`, [uid]);
      console.log(`auth.${t} count:`, res.rows[0].count);
    } catch (e) {
      // Some tables might not have user_id
      try {
        const resAll = await client.query(`SELECT count(*) FROM auth.${t}`);
        console.log(`auth.${t} total count:`, resAll.rows[0].count);
      } catch (err) {
        console.log(`auth.${t} query error:`, err.message);
      }
    }
  }

  await client.end();
}

main().catch(console.error);
