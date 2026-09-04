import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function test() {
  await client.connect();
  
  try {
      const res = await client.query(`
        SELECT school_id, role, tts_enabled, ota_enabled FROM public.users LIMIT 1
      `);
      console.log('Query success:', res.rows);
  } catch (err) {
      console.error('Query error:', err.message);
  }
  
  await client.end();
}

test().catch(console.error);
