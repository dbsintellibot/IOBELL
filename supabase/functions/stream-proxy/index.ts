import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const urlParam = new URL(req.url).searchParams.get('url');
    if (!urlParam) {
      return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Streaming proxy request for: ${urlParam}`);

    // Fetch the stream with User-Agent to bypass Zeno.fm blocks
    const response = await fetch(urlParam, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error(`Failed to fetch source stream. Status: ${response.status}`);
      return new Response(JSON.stringify({ error: `Source returned status ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    
    // Construct headers for the client
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', contentType);
    
    // Forward metadata headers if present
    const icyName = response.headers.get('icy-name');
    if (icyName) {
      responseHeaders.set('icy-name', icyName);
    }
    
    return new Response(response.body, {
      status: 200,
      headers: responseHeaders
    });

  } catch (err: any) {
    console.error('stream-proxy error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
