const sampleRatesMpeg1 = [44100, 48000, 32000, 0];
const sampleRatesMpeg2 = [22050, 24000, 16000, 0];
const sampleRatesMpeg25 = [11025, 12000, 8000, 0];

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

fetch('https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/pre-announcements/library/1784656872130_e0uphtx.mp3')
  .then(res => res.arrayBuffer())
  .then(ab => {
    const buf = Buffer.from(ab);
    console.log('Chime file size:', buf.length);
    console.log('Chime sample rate:', detectMp3SampleRate(buf));
  });
