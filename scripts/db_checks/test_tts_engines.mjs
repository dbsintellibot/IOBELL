async function main() {
  const text = 'Attention students, class is starting.';
  
  // Test Google Translate TTS
  try {
    const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    console.log('Testing Google Translate TTS:', gUrl);
    const res = await fetch(gUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log('Google Translate TTS status:', res.status, res.statusText);
    const buf = await res.arrayBuffer();
    console.log('Google Translate TTS byte length:', buf.byteLength);
  } catch (e) {
    console.error('Google Translate TTS error:', e.message);
  }

  // Test TikTok / soundoftext / stream-elements fallback
  try {
    const sotUrl = `https://soundoftext.com/static/sounds/de/123.mp3`; // soundoftext POST api
    console.log('Testing SoundOfText API...');
    const res = await fetch('https://soundoftext.com/api/v2/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'Google', data: { text: text, voice: 'en-US' } })
    });
    const data = await res.json();
    console.log('SoundOfText response:', data);
  } catch (e) {
    console.error('SoundOfText error:', e.message);
  }
}

main().catch(console.error);
