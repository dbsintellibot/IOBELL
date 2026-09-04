import fs from 'fs';

// Linear interpolation resampler for PCM audio
function resamplePCM(inputSamples, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) return inputSamples;
  const ratio = fromSampleRate / toSampleRate;
  const outputLength = Math.round(inputSamples.length / ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, inputSamples.length - 1);
    const frac = srcIdx - idx0;
    const s0 = inputSamples[idx0];
    const s1 = inputSamples[idx1];
    output[i] = Math.round(s0 + frac * (s1 - s0));
  }
  return output;
}

async function main() {
  console.log('Testing resampler function...');
  const input24k = new Int16Array(24000); // 1 second of 24kHz audio
  for (let i = 0; i < input24k.length; i++) {
    input24k[i] = Math.round(Math.sin(2 * Math.PI * 440 * i / 24000) * 16000);
  }
  const output44k = resamplePCM(input24k, 24000, 44100);
  console.log('Original samples:', input24k.length, 'Resampled samples:', output44k.length, 'Expected:', 44100);
}

main().catch(console.error);
