/**
 * Cloudflare Worker to proxy WebSocket connections to the Render backend
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // If this is a Socket.IO request, proxy it to the Render backend
    if (url.pathname.startsWith('/socket.io')) {
      // Clone the request but change the target to the Render backend
      const backendURL = 'https://name-model-convert-backend.onrender.com';
      const newUrl = new URL(url.pathname + url.search, backendURL);
      
      // Create a new request with the same method, headers, and body
      const newRequest = new Request(newUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow',
      });
      
      // Add CORS headers to the response
      return fetch(newRequest).then(response => {
        // Clone the response so we can modify headers
        const newResponse = new Response(response.body, response);
        
        // Add CORS headers
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
        
        return newResponse;
      });
    }
    
    // For all other requests, pass through to the Cloudflare Pages asset
    return env.ASSETS.fetch(request);
  },
}; 