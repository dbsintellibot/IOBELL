import fs from 'fs';

async function main() {
  console.log('Testing npm packages for JS MP3 decoding...');
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/js-mp3@0.1.0/dist/js-mp3.js');
    if (res.ok) {
      const text = await res.text();
      console.log('js-mp3 length:', text.length);
    }
  } catch (e) {
    console.error(e);
  }
}

main().catch(console.error);
