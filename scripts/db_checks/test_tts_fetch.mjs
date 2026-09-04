async function main() {
  // Test 1: fetch wttr.in weather
  try {
    console.log('Testing wttr.in weather fetch...');
    const weatherUrl = `https://wttr.in/Islamabad?format=j1`;
    const res1 = await fetch(weatherUrl, { headers: { 'User-Agent': 'AutoBell-Server/1.0' } });
    console.log('Weather status:', res1.status, res1.statusText);
  } catch (e) {
    console.error('Weather error:', e.message);
  }

  try {
    console.log('Testing ttsmp3.com fetch...');
    const text = 'Attention students, class is starting.';
    const voice = 'Brian';
    
    const params = new URLSearchParams();
    params.append('msg', text);
    params.append('lang', voice);
    params.append('source', 'ttsmp3');

    const res2 = await fetch('https://ttsmp3.com/makemp3.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: params.toString()
    });

    console.log('ttsmp3.com status:', res2.status, res2.statusText);
    const textRes = await res2.text();
    console.log('ttsmp3.com response:', textRes);
    
    if (res2.ok) {
      const data = JSON.parse(textRes);
      if (data.URL) {
        console.log('Fetching generated MP3 from:', data.URL);
        const mp3Res = await fetch(data.URL);
        console.log('MP3 download status:', mp3Res.status);
        const buf = await mp3Res.arrayBuffer();
        console.log('MP3 byte length:', buf.byteLength);
      }
    }
  } catch (e) {
    console.error('StreamElements TTS error:', e.message);
  }
}

main().catch(console.error);
