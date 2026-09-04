import fs from 'fs';

function chunkText(str, maxLen = 150) {
  const sentences = str.match(/[^.!?]+[.!?]+|[^.!?]+/g) || [str];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += (current ? ' ' : '') + s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function fetchStreamElementsTTS(text, gender = 'female') {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('Empty text for TTS');
  }

  try {
    const textChunks = chunkText(cleanText, 150);
    console.log(`Fetching ${gender === 'male' ? 'ttsmp3.com (Brian)' : 'Google Translate'} TTS for ${textChunks.length} chunk(s)...`);
    const audioBuffers = [];
    for (const chunk of textChunks) {
      if (gender === 'male') {
        const params = new URLSearchParams();
        params.append('msg', chunk);
        params.append('lang', 'Brian');
        params.append('source', 'ttsmp3');

        const ttsmp3Res = await fetch('https://ttsmp3.com/makemp3.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          body: params.toString()
        });

        if (!ttsmp3Res.ok) throw new Error(`ttsmp3.com failed with status ${ttsmp3Res.status}`);
        const data = await ttsmp3Res.json();
        console.log('ttsmp3.com response data:', data);
        if (data.Error !== 0 || !data.URL) {
          throw new Error(`ttsmp3.com returned error: ${data.Error}`);
        }

        const audioRes = await fetch(data.URL);
        if (!audioRes.ok) throw new Error(`Failed to download MP3 from ttsmp3.com: ${audioRes.status}`);
        const ab = await audioRes.arrayBuffer();
        if (ab.byteLength > 100) {
          audioBuffers.push(new Uint8Array(ab));
        }
      } else {
        const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en&client=tw-ob`;
        console.log('Fetching Google Translate URL:', gUrl);
        const res = await fetch(gUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!res.ok) throw new Error(`Google Translate TTS failed with status ${res.status}`);
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 100) {
          audioBuffers.push(new Uint8Array(ab));
        }
      }
    }
    if (audioBuffers.length > 0) {
      const totalLen = audioBuffers.reduce((acc, b) => acc + b.length, 0);
      const combinedTts = new Uint8Array(totalLen);
      let offset = 0;
      for (const b of audioBuffers) {
        combinedTts.set(b, offset);
        offset += b.length;
      }
      return combinedTts;
    }
  } catch (gErr) {
    console.warn(`TTS generation failed: ${gErr.message || gErr}`);
  }

  // Fallback: ttsmp3.com
  try {
    const voice = gender === 'male' ? 'Brian' : 'Amy';
    console.log(`Falling back to ttsmp3.com with voice ${voice}...`);
    const params = new URLSearchParams();
    params.append('msg', cleanText);
    params.append('lang', voice);
    params.append('source', 'ttsmp3');

    const ttsmp3Res = await fetch('https://ttsmp3.com/makemp3.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: params.toString()
    });

    if (!ttsmp3Res.ok) throw new Error(`ttsmp3.com fallback failed with status ${ttsmp3Res.status}`);
    const data = await ttsmp3Res.json();
    console.log('ttsmp3.com fallback response data:', data);
    if (data.Error !== 0 || !data.URL) {
      throw new Error(`ttsmp3.com fallback returned error: ${data.Error}`);
    }

    const audioRes = await fetch(data.URL);
    if (!audioRes.ok) throw new Error(`Failed to download MP3 from ttsmp3.com: ${audioRes.status}`);
    const ab = await audioRes.arrayBuffer();
    return new Uint8Array(ab);
  } catch (fbErr) {
    console.error('All TTS generation methods failed:', fbErr);
    throw fbErr;
  }
}

async function main() {
  const text = 'Attention please, this is a voice gender verification test.';
  
  console.log('--- Testing MALE ---');
  const maleBytes = await fetchStreamElementsTTS(text, 'male');
  console.log(`Got male bytes: ${maleBytes.length}`);
  fs.writeFileSync('test_male_local.mp3', maleBytes);
  
  console.log('\n--- Testing FEMALE ---');
  const femaleBytes = await fetchStreamElementsTTS(text, 'female');
  console.log(`Got female bytes: ${femaleBytes.length}`);
  fs.writeFileSync('test_female_local.mp3', femaleBytes);
}

main().catch(console.error);
