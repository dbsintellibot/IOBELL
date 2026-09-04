import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  try {
    const migrationPath = path.resolve('supabase/migrations/20260805180000_fix_tts_and_schedule_fallback.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('Applying migration:', migrationPath);
    await client.query(sql);
    console.log('Migration applied successfully!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
