// Cloudflare Worker CORS Proxy for SillyTavern-BotBrowser
// Based on typical cors-anywhere/proxy worker logic but customized for this extension's safety.

// Domains allowed to hit your proxy (to prevent abuse from random websites)
// If you want to restrict it completely to your own usage, set this to e.g., 'http://127.0.0.1:8000'
// Currently allowing all to make setup easy, but highly recommended to change.
const ALLOWED_ORIGINS = ['*'];

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      
      // Target URL must be provided in the 'url' query parameter
      // Example: https://yourworker.workers.dev/?url=https://chub.ai/api/...
      let targetUrlStr = url.searchParams.get('url');
      
      if (!targetUrlStr) {
        return new Response('Missing "url" query parameter. Provide the target API URL.', { 
            status: 400, 
            headers: corsHeaders 
        });
      }

      // Reconstruct target URL
      // (If there are multiple query parameters in the target URL, they might be split by the worker router.
      // Easiest is to decode it or reconstruct from the rest of the search string if needed.
      // Alternatively, the client should encodeURIComponent(targetUrl) so it passes as a single string)
      const targetUrl = new URL(decodeURIComponent(targetUrlStr));

      // Construct a new Request for the target API
      const clonedRequest = new Request(targetUrl, request);
      
      // Remove any headers that might cause issues (Host, Origin, Referer)
      clonedRequest.headers.delete("Host");
      clonedRequest.headers.delete("Origin");
      clonedRequest.headers.delete("Referer");
      clonedRequest.headers.set("User-Agent", "SillyTavern-BotBrowser-Proxy/1.0");

      // Fetch from the target API
      const response = await fetch(clonedRequest);

      // Create a response copy to allow modifying headers
      const newResponse = new Response(response.body, response);

      // Apply CORS headers to the response so the browser accepts it
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      
      return newResponse;

    } catch (error) {
       return new Response(`Proxy Error: ${error.message}`, {
         status: 500,
         headers: corsHeaders
       });
    }
  }
};
