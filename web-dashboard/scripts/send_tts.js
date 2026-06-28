import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer DATABASE_URL from .env.local if available; otherwise use pooler connection string
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const fallbackConnectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
const connectionString = process.env.DATABASE_URL || fallbackConnectionString;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const email = process.argv[2] || 'dbsintellibot@gmail.com';
  const text = process.argv[3] || 'This is a test announcement from AutoBell.';
  const language = process.argv[4] || 'en';

  const client = await pool.connect();
  try {
    console.log('Connected to database.');
    console.log(`Target user/email: ${email}`);

    // 1) Find school_id for the given user
    const userRes = await client.query(
      'SELECT id, school_id FROM public.users WHERE email = $1',
      [email]
    );
    if (userRes.rows.length === 0) {
      console.error('User not found');
      return;
    }
    const { school_id: schoolId } = userRes.rows[0];
    console.log('School ID:', schoolId);

    // 2) Find devices for school
    const devRes = await client.query(
      'SELECT id FROM public.bell_devices WHERE school_id = $1',
      [schoolId]
    );
    if (devRes.rows.length === 0) {
      console.error('No devices found for this school');
      return;
    }
    const deviceIds = devRes.rows.map(r => r.id);
    console.log(`Found ${deviceIds.length} device(s).`);

    // 3) Insert TTS command for each device
    const payload = { text, language };
    const values = [];
    const placeholders = [];
    let idx = 1;
    for (const deviceId of deviceIds) {
      values.push(deviceId, 'TTS', JSON.stringify(payload), 'pending', schoolId);
      placeholders.push(`($${idx}, $${idx+1}, $${idx+2}::jsonb, $${idx+3}, $${idx+4})`);
      idx += 5;
    }

    const sql = `
      INSERT INTO public.command_queue (device_id, command, payload, status, school_id)
      VALUES ${placeholders.join(', ')}
      RETURNING id, device_id
    `;
    const insertRes = await client.query(sql, values);
    console.log('Inserted commands:', insertRes.rows);

    // 4) Quick verify count pending for these devices
    const verifyRes = await client.query(
      'SELECT count(*) FROM public.command_queue WHERE school_id = $1 AND command = $2 AND status = $3',
      [schoolId, 'TTS', 'pending']
    );
    console.log('Pending TTS commands for school:', verifyRes.rows[0].count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
