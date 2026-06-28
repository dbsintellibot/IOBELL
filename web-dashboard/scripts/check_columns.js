
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fixAuthSchema(client) {
  console.log("Applying auth schema fixes.");
  await client.query("ALTER TABLE auth.sessions ALTER COLUMN id SET DEFAULT gen_random_uuid()");
  const typeRes = await client.query(`
    SELECT data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'auth' 
      AND table_name = 'refresh_tokens' 
      AND column_name = 'user_id'
  `);
  const dataType = typeRes.rows[0]?.data_type;
  if (dataType && dataType !== 'uuid') {
    console.log("Fixing auth.refresh_tokens.user_id type to uuid.");
    await client.query("ALTER TABLE auth.refresh_tokens ALTER COLUMN user_id TYPE uuid USING user_id::uuid");
  } else {
    console.log("auth.refresh_tokens.user_id is already uuid. No change needed.");
  }
  console.log("Auth schema fixes applied.");
}

async function checkBellTimeColumns(client) {
  console.log("Connected to database.");
  const colsRes = await client.query("SELECT * FROM bell_times LIMIT 1");
  if (colsRes.rows.length > 0) {
    console.log("Columns:", Object.keys(colsRes.rows[0]));
  } else {
    console.log("Table empty, checking information_schema...");
    const schemaRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bell_times'");
    console.log("Schema Columns:", schemaRes.rows.map(r => r.column_name));
  }
}

async function fixAuthUserTokens(client, email) {
  console.log("Fixing auth.users tokens for", email);
  await client.query(
    `
    UPDATE auth.users
    SET
      confirmation_token = COALESCE(confirmation_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      recovery_token = COALESCE(recovery_token, '')
    WHERE email = $1
  `,
    [email]
  );
  const res = await client.query(
    `
    SELECT email, confirmation_token, email_change, email_change_token_new, recovery_token
    FROM auth.users
    WHERE email = $1
  `,
    [email]
  );
  console.log("Updated rows:", res.rows);
}

async function main() {
  const client = await pool.connect();
  try {
    const args = process.argv.slice(2);
    if (args.includes('--fix-auth-schema')) {
      await fixAuthSchema(client);
    } else if (args[0] === '--fix-user-tokens' && args[1]) {
      await fixAuthUserTokens(client, args[1]);
    } else {
      await checkBellTimeColumns(client);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
