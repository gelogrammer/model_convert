// Socket.IO proxy function - handles all Socket.IO paths
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  
  // Check if this is an OPTIONS request (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      }
    });
  }
  
  // Target the Render backend
  const backendURL = 'https://name-model-convert-backend.onrender.com';
  
  // Preserve the original path and query parameters exactly as they are
  const targetURL = new URL(backendURL);
  targetURL.pathname = url.pathname; 
  targetURL.search = url.search;  // This ensures parameters like EIO, transport, t, and sid are preserved
  
  console.log(`Proxying Socket.IO request: ${request.method} ${url.pathname}${url.search} to ${targetURL.toString()}`);
  
  // Create headers object with original headers
  const headers = new Headers(request.headers);
  
  // Modify headers to prevent CORS issues
  headers.set('Origin', backendURL);
  
  // If this is a transport=polling request, ensure proper content-type
  if (url.search.includes('transport=polling')) {
    // For polling transport, we need to make sure content-type is correct
    if (request.method === 'POST') {
      headers.set('Content-Type', 'text/plain;charset=UTF-8');
    }
  }
  
  // Create a new request to the backend
  const newRequest = new Request(targetURL.toString(), {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow',
  });
  
  try {
    // Fetch from the backend
    const response = await fetch(newRequest);
    
    // Check if the response is successful
    if (!response.ok) {
      console.error(`Backend returned error status: ${response.status} ${response.statusText}`);
      
      // For debugging: log the response content
      const responseText = await response.text();
      console.error(`Error response body: ${responseText}`);
      
      // Return the error exactly as received for debugging
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
          'Access-Control-Allow-Credentials': 'true',
        }
      });
    }
    
    // Get the raw response body
    const responseBody = await response.arrayBuffer();
    
    // Create a new response with CORS headers
    const newResponse = new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
      }
    });
    
    return newResponse;
  } catch (error) {
    console.error(`Socket.IO proxy error: ${error.message}`);
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