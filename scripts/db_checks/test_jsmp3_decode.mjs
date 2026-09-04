async function main() {
  console.log('Fetching js-mp3 code from esm.sh...');
  const jsRes = await fetch('https://cdn.jsdelivr.net/npm/js-mp3@0.1.0/dist/js-mp3.js');
  if (!jsRes.ok) {
    console.log('js-mp3 status:', jsRes.status);
    return;
  }
  const code = await jsRes.text();
  console.log('Fetched js-mp3 code, length:', code.length);

  const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent('Today weather in Islamabad 30 degrees')}&tl=en&client=tw-ob`;
  const res = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const buf = Buffer.from(await res.arrayBuffer());

  const fn = new Function(code + '; return decodeMp3;');
  const decodeMp3 = fn();
  console.log('decodeMp3 function available:', typeof decodeMp3);
  const result = decodeMp3(buf);
  console.log('Decoded result:', result);
}

main().catch(console.error);
