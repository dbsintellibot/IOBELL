import pg from 'pg';
import crypto from 'crypto';

// Let's use bcrypt or postgres crypt function extension if available in Supabase
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const email = 'muddasirh@gmail.com';
  const newPassword = 'AutoBell2026!';

  console.log(`Updating password for ${email}...`);
  // Use extensions.crypt from pgcrypto in Supabase
  await client.query(`
    UPDATE auth.users
    SET encrypted_password = extensions.crypt($1, extensions.gen_salt('bf'))
    WHERE LOWER(email) = LOWER($2);
  `, [newPassword, email]);

  console.log('Password successfully set in auth.users!');
  await client.end();
}

main().catch(console.error);
