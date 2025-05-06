// Socket.IO proxy function for Cloudflare Pages
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  
  // Target the Render backend
  const backendURL = 'https://name-model-convert-backend.onrender.com';
  const targetURL = new URL(url.pathname + url.search, backendURL);
  
  // Create a new request to the backend
  const newRequest = new Request(targetURL.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow',
  });
  
  try {
    // Fetch from the backend
    const response = await fetch(newRequest);
    
    // Create a new response with CORS headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    
    return newResponse;
  } catch (error) {
    // Return an error response
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
} 