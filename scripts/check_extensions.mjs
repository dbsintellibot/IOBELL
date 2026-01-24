import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function checkExtensions() {
  try {
    await client.connect();
    console.log('Connected to database');

    const res = await client.query(`
      SELECT * FROM pg_extension WHERE extname = 'pgcrypto';
    `);
    
    console.log('pgcrypto extension:', res.rows);

    const schemaRes = await client.query(`
        SELECT nspname FROM pg_namespace 
        WHERE oid = (SELECT extnamespace FROM pg_extension WHERE extname = 'pgcrypto');
    `);
    console.log('pgcrypto schema:', schemaRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

checkExtensions();
