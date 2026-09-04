import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const deviceId = '2eddb8b2-9e17-41a5-958f-56fd73d6fa52'; // AC:A7:04:12:67:6C
  const audioUrl = 'https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/audio-files/deeb76f3-7d81-41a7-bac7-3ae94732b84b/s0dc655vx8.mp3';

  try {
    console.log('Enqueueing PLAY_URL command for Bell.mp3...');
    const playRes = await client.query(`
      INSERT INTO public.command_queue (device_id, command, payload, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [deviceId, 'PLAY_URL', { url: audioUrl }, 'pending']);
    console.log('PLAY_URL enqueued:', playRes.rows[0]);
  } catch (err) {
    console.error('Error enqueueing command:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
