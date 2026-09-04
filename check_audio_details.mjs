import pg from 'pg';
const { Client } = pg;

// We implement detectMp3SampleRate in JS
function detectMp3SampleRate(buffer) {
  let offset = 0;
  if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) |
                 ((buffer[7] & 0x7F) << 14) |
                 ((buffer[8] & 0x7F) << 7) |
                 (buffer[9] & 0x7F);
    offset = 10 + size;
    if ((buffer[5] & 0x10) !== 0) offset += 10;
  }

  const sampleRatesMpeg1 = [44100, 48000, 32000, 0];
  const sampleRatesMpeg2 = [22050, 24000, 16000, 0];
  const sampleRatesMpeg25 = [11025, 12000, 8000, 0];

  while (offset <= buffer.length - 4) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const mpegVer = (b1 >> 3) & 0x03;
      const layer = (b1 >> 1) & 0x03;
      if (layer === 1) { // Layer III
        const sampleRateIdx = (b2 >> 2) & 0x03;
        let sr = 44100;
        if (mpegVer === 3) sr = sampleRatesMpeg1[sampleRateIdx];
        else if (mpegVer === 2) sr = sampleRatesMpeg2[sampleRateIdx];
        else if (mpegVer === 0) sr = sampleRatesMpeg25[sampleRateIdx];
        if (sr > 0) return sr;
      }
    }
    offset++;
  }
  return 24000;
}

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const schoolId = 'deeb76f3-7d81-41a7-bac7-3ae94732b84b';

  // 1. Fetch audio files for school
  const audioRes = await client.query('SELECT * FROM public.audio_files WHERE school_id = $1', [schoolId]);
  console.log(`=== Audio Files for School ${schoolId} ===`);
  console.log(`Total: ${audioRes.rows.length} files`);
  
  for (const af of audioRes.rows) {
    const url = `https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/audio-files/${af.storage_path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`  File: ${af.name} (${af.id}) -> FETCH FAILED: ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const sr = detectMp3SampleRate(buffer);
      console.log(`  File: ${af.name} (${af.id})`);
      console.log(`    Storage Path: ${af.storage_path}`);
      console.log(`    Track Number: ${af.track_number}`);
      console.log(`    Duration: ${af.duration}s`);
      console.log(`    Size: ${buffer.length} bytes`);
      console.log(`    Sample Rate: ${sr} Hz`);
    } catch (e) {
      console.error(`    Error checking ${af.name}: ${e.message}`);
    }
  }

  // 2. Fetch active pre-announcement chime details
  console.log(`\n=== Pre-Announcement Chime ===`);
  const chimeUrl = 'https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/pre-announcements/library/1784656840491_rdql4gx.mp3';
  try {
    const response = await fetch(chimeUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const sr = detectMp3SampleRate(buffer);
      console.log(`  Pre-Announcement Chime: ${chimeUrl}`);
      console.log(`    Size: ${buffer.length} bytes`);
      console.log(`    Sample Rate: ${sr} Hz`);
    } else {
      console.log(`  Failed to fetch chime: ${response.status}`);
    }
  } catch (e) {
    console.error(`  Error checking chime: ${e.message}`);
  }

  await client.end();
}

main().catch(console.error);
