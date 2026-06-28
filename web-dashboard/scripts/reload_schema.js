import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function reloadSchema() {
  console.log('Reloading PostgREST schema cache...');
  try {
    await client.connect();
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('Schema reload notification sent.');
  } catch (err) {
    console.error('Error reloading schema:', err);
  } finally {
    await client.end();
  }
}

reloadSchema();
