import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

function getConnectionString() {
  const direct = process.env.DATABASE_URL;
  if (direct && direct.length > 0) return direct;

  try {
    const sendTtsPath = path.resolve(__dirname, './send_tts.js');
    const contents = fs.readFileSync(sendTtsPath, 'utf8');
    const match = contents.match(/fallbackConnectionString\s*=\s*"([^"]+)"/);
    if (match && match[1]) return match[1];
  } catch {
  }

  return null;
}

const connectionString = getConnectionString();
if (!connectionString) {
  throw new Error('Missing DATABASE_URL (set it in web-dashboard/.env.local or provide a fallback in scripts/send_tts.js)');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');

    const migrations = [
      '20260221000002_dfplayer_quiet_hours.sql',
      '20260213000002_group_device_schedules.sql',
      '20260223000001_fix_get_device_config_uuid_max.sql',
      '20260320000001_school_quiet_hours.sql',
      '20260320000002_get_device_config_quiet_hours.sql',
      '20260320000003_add_theme_mode.sql'
    ];

    for (const file of migrations) {
      const migrationFile = path.resolve(__dirname, '../../supabase/migrations/', file);
      const sql = fs.readFileSync(migrationFile, 'utf8');

      console.log(`Running migration: ${file}...`);
      await client.query(sql);
      console.log(`Migration ${file} applied successfully`);
    }
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

run();
