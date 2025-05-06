import { io, Socket } from 'socket.io-client';

// WebSocket connection
let socket: Socket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let connectionRetryCount = 0;
const MAX_RETRIES = 5;

// Control flag for audio processing
let processAudioEnabled = false;

// WebSocket event handlers
interface WebSocketHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onEmotionResult?: (data: any) => void;
  onError?: (error: Error) => void;
  onReconnectAttempt?: (attempt: number) => void;
  onReconnect?: () => void;
}

/**
 * Initialize WebSocket connection
 */
export const initializeWebSocket = (handlers: WebSocketHandlers) => {
  // Close existing connection if any
  if (socket) {
    socket.close();
  }

  // Clear any existing heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  try {
    // Test backend connectivity first with a fetch request
    testBackendConnectivity()
      .then(isAvailable => {
        if (!isAvailable) {
          console.warn('Backend server is not available, operating in fallback mode');
          handlers.onError?.(new Error('Backend server is not available. Running in offline mode.'));
          return;
        }
        
        // Create new connection 
        connectSocket(handlers);
      })
      .catch(error => {
        console.error('Error testing backend connectivity:', error);
        handlers.onError?.(new Error('Failed to connect to backend. Running in offline mode.'));
      });
    
    return socket;
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error);
    handlers.onError?.(new Error(`WebSocket initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    return null;
  }
};

/**
 * Test backend connectivity before attempting to connect WebSocket
 */
const testBackendConnectivity = async (): Promise<boolean> => {
  try {
    // For Cloudflare Pages deployment, use direct backend URL for health check
    const isCloudflarePages = window.location.hostname.includes('pages.dev');
    
    // Always use direct backend URL for health check
    const apiUrl = 'https://name-model-convert-backend.onrender.com';
    
    console.log(`Testing backend connectivity at ${apiUrl}/api/health`);
    
    // Use the health endpoint to check if backend is up
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Increase timeout
    
    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log(`Backend health check response: ${response.status} ${response.statusText}`);
      
      // If on Cloudflare Pages, skip the health check verification and connect anyway
      if (isCloudflarePages) {
        console.log("Running on Cloudflare Pages - will attempt socket connection regardless of health check");
        return true;
      }
      
      return response.ok;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('Backend health check fetch error:', fetchError);
      
      // If on Cloudflare Pages, attempt connection via proxy even if health check fails
      if (isCloudflarePages) {
        console.log("Running on Cloudflare Pages - will attempt socket connection via proxy despite health check failure");
        return true;
      }
      
      return false;
    }
  } catch (error) {
    console.warn('Backend connectivity test error:', error);
    return false;
  }
};

/**
 * Connect to WebSocket server
 */
const connectSocket = (handlers: WebSocketHandlers) => {
  // For Cloudflare Pages deployment, use the local proxy to avoid CORS issues
  const isCloudflarePages = window.location.hostname.includes('pages.dev');
  
  // Get the API URL - for Cloudflare, use the local proxy
  const apiUrl = isCloudflarePages 
    ? window.location.origin  // Use the same origin (our Functions will proxy to backend)
    : (
        import.meta.env.VITE_API_URL || 
        import.meta.env.VITE_BACKEND_URL || 
        (window as any).__env?.VITE_API_URL ||
        (window as any).__env?.VITE_BACKEND_URL ||
        'https://name-model-convert-backend.onrender.com'
      );
  
  console.log(`Connecting to WebSocket server at ${apiUrl} (${isCloudflarePages ? 'via proxy' : 'direct'})`);
  
  // Configure Socket.IO differently for Cloudflare Pages
  const socketOptions = {
    transports: ['polling'], // Use only polling - more reliable through Cloudflare
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 60000, // Long timeout for polling
    forceNew: true,
    path: '/socket.io/',
    autoConnect: true
  };
  
  console.log('Socket.IO configuration:', socketOptions);
  
  // Close any existing connections
  if (socket) {
    console.log('Closing existing Socket.IO connection');
    socket.close();
    socket = null;
  }
  
  // Create new socket connection
  socket = io(apiUrl, socketOptions);
  
  // Log more detailed connection information
  socket.io.on("reconnect_attempt", () => {
    console.log("Attempting to reconnect to WebSocket...");
  });

  socket.io.on("reconnect_error", (error) => {
    console.error("Error while reconnecting to WebSocket:", error);
  });

  socket.io.on("reconnect_failed", () => {
    console.error("Failed to reconnect to WebSocket after all attempts");
    handlers.onError?.(new Error("Failed to reconnect to backend after all attempts"));
  });

  // Setup event handlers
  socket.on('connect', () => {
    console.log('WebSocket connected');
    connectionRetryCount = 0;
    handlers.onConnect?.();
    
    // Start heartbeat after connection
    startHeartbeat();
  });

  socket.on('disconnect', (reason) => {
    console.log(`WebSocket disconnected: ${reason}`);
    handlers.onDisconnect?.();
    
    // Clear heartbeat on disconnect
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  });

  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error);
    
    // Count retries to avoid infinite retry loop
    connectionRetryCount++;
    
    if (connectionRetryCount >= MAX_RETRIES) {
      console.error(`Failed to connect after ${MAX_RETRIES} attempts, giving up`);
      socket?.close();
      handlers.onError?.(new Error(`Connection failed after ${MAX_RETRIES} attempts. Backend may be unavailable.`));
    } else {
      handlers.onError?.(new Error(`Connection error: ${error.message}`));
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`WebSocket reconnect attempt ${attempt}`);
    handlers.onReconnectAttempt?.(attempt);
  });

  socket.on('reconnect', () => {
    console.log('WebSocket reconnected');
    connectionRetryCount = 0;
    handlers.onReconnect?.();
    
    // Restart heartbeat after reconnection
    startHeartbeat();
  });

  socket.on('emotion_result', (data) => {
    console.log('Emotion result:', data);
    handlers.onEmotionResult?.(data);
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
    handlers.onError?.(new Error(error.message || 'Unknown error'));
  });

  // Start heartbeat immediately
  startHeartbeat();
};

/**
 * Start heartbeat to keep connection alive
 */
const startHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('ping');
    }
  }, 5000); // Send heartbeat every 5 seconds
};

/**
 * Close WebSocket connection
 */
export const closeWebSocket = () => {
  // Clear heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  // Close socket
  if (socket) {
    socket.close();
    socket = null;
  }
  
  // Reset retry counter
  connectionRetryCount = 0;
};

/**
 * Enable or disable audio processing
 */
export const setAudioProcessingEnabled = (enabled: boolean) => {
  processAudioEnabled = enabled;
  
  // Inform the server about the change
  if (socket && socket.connected) {
    socket.emit('set_processing', { enabled });
    console.log(`Audio processing ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }
  
  return false;
};

/**
 * Send audio data to server
 */
export const sendAudioData = (audioData: string, metadata?: any) => {
  if (socket && socket.connected) {
    socket.emit('audio_stream', {
      audio: audioData,
      metadata: {
        ...metadata || {},
        processAudio: processAudioEnabled
      }
    });
    return true;
  }
  return false;
};

/**
 * Check if WebSocket is connected
 */
export const isWebSocketConnected = () => {
  return socket?.connected || false;
};
