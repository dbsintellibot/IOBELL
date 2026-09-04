import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0.OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0';
const schoolId = 'deeb76f3-7d81-41a7-bac7-3ae94732b84b';

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function triggerPrecombine() {
  console.log('Triggering Edge Function precombine-schedule...');
  const response = await fetch('https://hjlwzkwiweocnfztshmy.supabase.co/functions/v1/precombine-schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({ school_id: schoolId })
  });
  const data = await response.json();
  console.log('Precombine response:', data);
  return data;
}

async function main() {
  await client.connect();
  try {
    // 1. Find a TTS schedule item
    const timesRes = await client.query(`
      SELECT bt.id, bt.tts_message
      FROM bell_times bt
      JOIN bell_profiles bp ON bt.profile_id = bp.id
      WHERE bp.school_id = $1 AND bt.play_type = 'tts'
      LIMIT 1
    `, [schoolId]);

    if (timesRes.rows.length === 0) {
      console.warn('No TTS schedule item found for verification! Creating a temporary one...');
      // Find bahria active profile
      const profRes = await client.query('SELECT id FROM bell_profiles WHERE school_id = $1 AND is_active = true LIMIT 1', [schoolId]);
      const profileId = profRes.rows[0]?.id;
      if (!profileId) {
        throw new Error('No active profile found to attach test item to.');
      }
      
      const insertRes = await client.query(`
        INSERT INTO bell_times (profile_id, bell_time, day_of_week, play_type, tts_message, label, include_weather)
        VALUES ($1, '09:30:00', ARRAY[1,2,3,4,5], 'tts', 'Attention please, this is a voice gender verification test.', 'Test Voice', false)
        RETURNING id, tts_message
      `, [profileId]);
      timesRes.rows.push(insertRes.rows[0]);
    }

    const testItem = timesRes.rows[0];
    console.log(`Using schedule item ${testItem.id} (message: "${testItem.tts_message}")`);

    // 2. Test MALE Voice
    console.log('\n--- Setting TTS Voice to MALE ---');
    await client.query('UPDATE bell_times SET tts_gender = \'male\', precombined_at = NULL WHERE id = $1', [testItem.id]);
    await triggerPrecombine();

    // Download generated combined file
    const maleUrl = `https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/audio-files/combined/s_${testItem.id}.mp3?t=${Date.now()}`;
    console.log(`Downloading male combined MP3 from: ${maleUrl}`);
    const maleRes = await fetch(maleUrl);
    if (maleRes.ok) {
      const maleBuf = Buffer.from(await maleRes.arrayBuffer());
      fs.writeFileSync('verify_male.mp3', maleBuf);
      console.log(`Successfully saved verify_male.mp3 (${maleBuf.byteLength} bytes)`);
    } else {
      console.error(`Failed to download male MP3: ${maleRes.status}`);
    }

    // 3. Test FEMALE Voice
    console.log('\n--- Setting TTS Voice to FEMALE ---');
    await client.query('UPDATE bell_times SET tts_gender = \'female\', precombined_at = NULL WHERE id = $1', [testItem.id]);
    await triggerPrecombine();

    const femaleUrl = `https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/audio-files/combined/s_${testItem.id}.mp3?t=${Date.now()}`;
    console.log(`Downloading female combined MP3 from: ${femaleUrl}`);
    const femaleRes = await fetch(femaleUrl);
    if (femaleRes.ok) {
      const femaleBuf = Buffer.from(await femaleRes.arrayBuffer());
      fs.writeFileSync('verify_female.mp3', femaleBuf);
      console.log(`Successfully saved verify_female.mp3 (${femaleBuf.byteLength} bytes)`);
    } else {
      console.error(`Failed to download female MP3: ${femaleRes.status}`);
    }

    // 4. Restore to default (NULL)
    console.log('\n--- Restoring schedule voice to Default (NULL) ---');
    await client.query('UPDATE bell_times SET tts_gender = NULL, precombined_at = NULL WHERE id = $1', [testItem.id]);
    await triggerPrecombine();

  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
