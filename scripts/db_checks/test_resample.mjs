import fs from 'fs';

const parseMp3SampleRate = (buf) => {
  let offset = 0;
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7F) << 21) | ((buf[7] & 0x7F) << 14) | ((buf[8] & 0x7F) << 7) | (buf[9] & 0x7F);
    offset = 10 + size;
    if ((buf[5] & 0x10) !== 0) offset += 10;
  }
  const sampleRatesMpeg1 = [44100, 48000, 32000, 0];
  const sampleRatesMpeg2 = [22050, 24000, 16000, 0];
  const sampleRatesMpeg25 = [11025, 12000, 8000, 0];
  while (offset <= buf.length - 4) {
    if (buf[offset] === 0xFF && (buf[offset + 1] & 0xE0) === 0xE0) {
      const b1 = buf[offset + 1];
      const b2 = buf[offset + 2];
      const mpegVer = (b1 >> 3) & 0x03;
      const sampleRateIdx = (b2 >> 2) & 0x03;
      let sr = 0;
      if (mpegVer === 3) sr = sampleRatesMpeg1[sampleRateIdx];
      else if (mpegVer === 2) sr = sampleRatesMpeg2[sampleRateIdx];
      else if (mpegVer === 0) sr = sampleRatesMpeg25[sampleRateIdx];
      if (sr > 0) return { sr, mpegVer };
    }
    offset++;
  }
  return { sr: 0, mpegVer: -1 };
};

async function testEngine(name, fetchFn) {
  try {
    const res = await fetchFn();
    if (!res || !res.ok) {
      console.log(name, 'Failed status:', res?.status);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(name, 'Result:', parseMp3SampleRate(buf), 'Len:', buf.length);
  } catch (e) {
    console.log(name, 'Error:', e.message);
  }
}

async function main() {
  const text = 'Today weather in Islamabad 30 degrees Celsius sunny';

  // 1. Google Translate
  await testEngine('Google Translate (client=tw-ob)', () =>
    fetch(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
  );

  // 2. Google Translate Android Client (client=at)
  await testEngine('Google Translate (client=at)', () =>
    fetch(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=at`, {
      headers: { 'User-Agent': 'AndroidTranslate/5.3.0.c.137452661' }
    })
  );

  // 3. ResponsiveVoice
  await testEngine('ResponsiveVoice', () =>
    fetch(`https://code.responsivevoice.org/develop/getvoice.php?t=${encodeURIComponent(text)}&tl=en&sv=&vn=&pitch=0.5&rate=0.5&vol=1&key=FREE_KEY`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
  );

  // 4. VoiceGlot / VoiceRSS
  await testEngine('VoiceGlot', () =>
    fetch(`https://api.voiceglot.com/tts?text=${encodeURIComponent(text)}&lang=en`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
  );

  // 5. TTSMP3 / ttsmp3.com
  await testEngine('TTSMP3.com', () =>
    fetch('https://ttsmp3.com/makemp3_new.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `msg=${encodeURIComponent(text)}&lang=Brian&source=ttsmp3`
    })
  );
}

main().catch(console.error);
