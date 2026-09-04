import { MPEGDecoder } from 'mpg123-decoder';
import lamejs from 'lamejs';
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

async function resampleMp3To44100(inputMp3Bytes) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const { channelData, sampleRate } = decoder.decodeBuffer(inputMp3Bytes);
  decoder.free();

  console.log('Decoded sampleRate:', sampleRate, 'samples:', channelData[0].length);

  if (sampleRate === 44100) return inputMp3Bytes;

  const rawPcmFloat = channelData[0];
  const fromLength = rawPcmFloat.length;
  const ratio = sampleRate / 44100;
  const toLength = Math.round(fromLength / ratio);
  const resampledInt16 = new Int16Array(toLength);

  for (let i = 0; i < toLength; i++) {
    const srcIdx = i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, fromLength - 1);
    const frac = srcIdx - idx0;
    const f0 = rawPcmFloat[idx0];
    const f1 = rawPcmFloat[idx1];
    const val = f0 + frac * (f1 - f0);
    const clamped = Math.max(-1.0, Math.min(1.0, val));
    resampledInt16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }

  const encoder = new lamejs.Mp3Encoder(1, 44100, 128);
  const mp3Data = [];
  const sampleBlockSize = 1152;

  for (let i = 0; i < resampledInt16.length; i += sampleBlockSize) {
    const sampleChunk = resampledInt16.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(Buffer.from(mp3buf));
    }
  }

  const mp3bufEnd = encoder.flush();
  if (mp3bufEnd.length > 0) {
    mp3Data.push(Buffer.from(mp3bufEnd));
  }

  return Buffer.concat(mp3Data);
}

async function main() {
  console.log('Fetching Google Translate TTS (24kHz)...');
  const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent('Today weather in Islamabad is 30 degrees Celsius and sunny.')}&tl=en&client=tw-ob`;
  const res = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const origBuf = Buffer.from(await res.arrayBuffer());
  console.log('Original Google TTS MP3:', parseMp3SampleRate(origBuf));

  const resampledBuf = await resampleMp3To44100(origBuf);
  console.log('Resampled MP3:', parseMp3SampleRate(resampledBuf));
}

main().catch(console.error);
