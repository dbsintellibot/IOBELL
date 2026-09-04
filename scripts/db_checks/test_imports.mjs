async function testImport(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log(url, 'Status:', res.status, 'Len:', text.length, 'Contains web-worker:', text.includes('web-worker'));
  } catch (e) {
    console.error(url, e.message);
  }
}

async function main() {
  await testImport('https://esm.sh/mpg123-decoder@0.4.11');
  await testImport('https://esm.sh/mpg123-decoder@0.4.11/decoder');
  await testImport('https://esm.sh/@breezystack/lamejs@1.2.7');
  await testImport('https://esm.sh/minimp3-wasm@0.0.4');
  await testImport('https://esm.sh/js-mp3@0.1.0');
}

main().catch(console.error);
