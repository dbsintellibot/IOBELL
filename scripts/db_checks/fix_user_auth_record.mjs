import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const uid = '20ab9558-8c4d-4d5c-a8f1-f19d43efdcc9';
  console.log('Fixing auth.identities.id and auth.users tokens for dbstrovear@gmail.com...');

  await client.query(`
    UPDATE auth.identities
    SET id = gen_random_uuid()
    WHERE user_id = $1;
  `, [uid]);

  await client.query(`
    UPDATE auth.users
    SET confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change = ''
    WHERE id = $1;
  `, [uid]);

  console.log('Update complete!');
  await client.end();
}

main().catch(console.error);
