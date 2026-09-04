import fs from 'fs';

function inspectFile(filename) {
  if (!fs.existsSync(filename)) {
    console.log(`${filename} does not exist.`);
    return;
  }
  const buf = fs.readFileSync(filename);
  console.log(`\n=== File: ${filename} ===`);
  console.log(`Total size: ${buf.length} bytes`);
  console.log(`Header (first 32 bytes hex):`, buf.subarray(0, 32).toString('hex'));
  console.log(`Footer (last 32 bytes hex):`, buf.subarray(buf.length - 32).toString('hex'));
  
  // Try to find ID3 text if any
  const ascii = buf.toString('ascii');
  const id3Matches = ascii.match(/[a-zA-Z0-9\s.,!?-]{5,}/g);
  if (id3Matches) {
    console.log(`Extracted strings:`, id3Matches.slice(0, 5));
  }
}

inspectFile('verify_male.mp3');
inspectFile('verify_female.mp3');
