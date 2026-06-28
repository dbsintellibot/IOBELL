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

async function checkUser() {
  const email = 'digitapbs@gmail.com';
  console.log(`Checking user: ${email}`);

  try {
    await client.connect();
    
    const res = await client.query(
      'SELECT id, email, role, ota_enabled FROM public.users WHERE email = $1',
      [email]
    );

    if (res.rows.length > 0) {
      console.log('User found:', res.rows[0]);
    } else {
      console.log('User not found');
    }
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await client.end();
  }
}

checkUser();
