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
    // Get the backend URL from environment variables or use a fallback
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://speech-emotion-recognition-api-t5e8.onrender.com';
    
    // Use the environment variable or localhost for local development
    const baseUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:5001'
      : backendUrl;
    
    console.log(`Testing backend connectivity with base URL: ${baseUrl}`);
    
    // Create an array of endpoints to try, in order of preference
    const endpointsToTry = [
      // Simple ping endpoint that shouldn't require much server resources
      `${baseUrl}/api/health`,
      // Backup endpoints in case health isn't implemented properly
      `${baseUrl}/api`,
      `${baseUrl}`,
      // Socket.io specific endpoint
      `${baseUrl}/socket.io/`,
    ];
    
    // Check if Render.com hosted service (which might be hibernating)
    const isRenderService = backendUrl.includes('render.com');
    if (isRenderService) {
      console.log('Detected Render.com hosted service - hibernation may be an issue');
    }
    
    // We'll track our attempts for diagnostic purposes
    let attemptsMade = 0;
    const maxAttempts = isRenderService ? 5 : 3; // More retries for Render services
    
    // Function to make an actual connectivity attempt with retries
    const attemptConnectivity = async (): Promise<boolean> => {
      attemptsMade++;
      console.log(`Connectivity attempt ${attemptsMade} of ${maxAttempts}`);
      
      // Try each endpoint in sequence
      for (const endpoint of endpointsToTry) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          
          // Use a longer timeout for Render.com services
          const timeoutMs = isRenderService ? 20000 : 8000;
          
          // Create an AbortController to handle timeouts
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
            controller.abort();
          }, timeoutMs);
          
          // Make request with appropriate headers
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Accept': '*/*',
              'Content-Type': 'application/json',
              'Origin': window.location.origin,
              'Cache-Control': 'no-cache',
              'Connection': 'close', // Explicitly close connections to avoid hanging
            },
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal
          }).catch(err => {
            console.warn(`Fetch error for ${endpoint}:`, err);
            return null;
          });
          
          clearTimeout(timeoutId);
          
          if (response) {
            // Any response (even non-200) indicates the server is running
            console.log(`Got response from ${endpoint} with status ${response.status}`);
            return true;
          }
        } catch (err) {
          console.warn(`Error testing ${endpoint}:`, err);
          // Continue to next endpoint
        }
      }
      
      return false; // No endpoints responded
    };
    
    // Try connectivity with retries
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const isConnected = await attemptConnectivity();
      if (isConnected) {
        console.log('Backend connectivity test succeeded');
        return true;
      }
      
      // If not connected and not the last attempt, wait before retrying
      if (attempt < maxAttempts - 1) {
        const waitTime = (attempt + 1) * 3000; // Exponential backoff with longer wait time
        console.log(`Waiting ${waitTime}ms before retrying...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    console.error(`Backend connectivity test failed after ${maxAttempts} attempts`);
    return false;
  } catch (error) {
    console.warn('Backend connectivity test failed completely:', error);
    return false;
  }
};

/**
 * Connect to WebSocket server
 */
const connectSocket = (handlers: WebSocketHandlers) => {
  // Get the backend URL from environment variables or use a fallback
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://speech-emotion-recognition-api-t5e8.onrender.com';
  
  // Use the environment variable or fallback to origin for local dev
  const serverUrl = window.location.hostname === 'localhost' ? 
    'http://localhost:5001' : backendUrl;
  
  console.log(`Connecting to WebSocket server at ${serverUrl}`);
  
  // Check if this is a Render.com service (which might hibernate)
  const isRenderService = serverUrl.includes('render.com');
  if (isRenderService) {
    console.log('Detected Render.com service - using longer timeouts for hibernation wakeup');
  }
  
  try {
    // If the socket already exists, clean it up properly before creating a new one
    if (socket) {
      try {
        console.log('Cleaning up existing socket connection before creating a new one');
        socket.removeAllListeners();
        socket.disconnect();
        socket.close();
        socket = null;
      } catch (e) {
        console.warn('Error cleaning up existing socket:', e);
      }
    }
    
    // Configure Socket.io with appropriate settings
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'], // Add polling as fallback
      reconnection: true,
      reconnectionAttempts: isRenderService ? 20 : 15, // More attempts for Render services
      reconnectionDelay: 1000,
      reconnectionDelayMax: isRenderService ? 10000 : 5000, // Cap the reconnection delay
      timeout: isRenderService ? 40000 : 30000, // Longer timeout for Render services
      forceNew: true,
      randomizationFactor: 0.5, // Add some randomness to reconnection attempts to prevent thundering herd
      path: '/socket.io/',
      withCredentials: false, // Disable credentials to avoid CORS preflight
      extraHeaders: {
        "Content-Type": "application/json",
        "Origin": window.location.origin,
        "Connection": "keep-alive" // Try to keep connection alive
      },
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true
    });

    // Hibernation handling for Render.com
    let isWakingUpRender = false;
    let badFileDescriptorCount = 0; // Track bad file descriptor errors
    
    // Setup event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      connectionRetryCount = 0;
      isWakingUpRender = false;
      badFileDescriptorCount = 0; // Reset counter on successful connection
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
      
      // If the connection was lost due to server errors, try to reconnect manually
      if (reason === 'transport error' || reason === 'transport close' || reason.includes('timeout')) {
        console.log('Transport error or timeout occurred, will attempt to reconnect...');
        
        // Let's proactively try to reconnect after a short delay
        setTimeout(() => {
          if (socket && !socket.connected) {
            console.log('Manual reconnection attempt after transport error');
            socket.connect();
          }
        }, 3000);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      
      // Check for common socket errors
      const errorMessage = error.message || '';
      if (errorMessage.includes('Bad file descriptor') || errorMessage.includes('EBADF')) {
        badFileDescriptorCount++;
        console.log(`Bad file descriptor error detected (${badFileDescriptorCount} occurrences)`);
        
        // If we get too many bad file descriptor errors, recreate the socket entirely
        if (badFileDescriptorCount >= 3) {
          console.log('Too many bad file descriptor errors, recreating socket connection');
          
          // Force close and recreate socket
          try {
            socket?.removeAllListeners();
            socket?.disconnect();
            socket?.close();
            socket = null;
            
            // Wait before recreating
            setTimeout(() => {
              console.log('Recreating socket after bad file descriptor errors');
              connectSocket(handlers);
            }, 5000);
            
            return;
          } catch (e) {
            console.warn('Error while trying to reset socket after bad file descriptor errors:', e);
          }
        }
      }
      
      // Special handling for Render.com hibernation
      if (isRenderService && !isWakingUpRender) {
        isWakingUpRender = true;
        console.log('Attempting to wake up hibernating Render.com service...');
        
        // Try to wake up the service with multiple fetch requests to different endpoints
        const wakeupEndpoints = [
          `${serverUrl}/api/health`,
          `${serverUrl}/api`,
          `${serverUrl}`
        ];
        
        // Try each endpoint with a small delay between attempts
        let endpointIndex = 0;
        const tryNextEndpoint = () => {
          if (endpointIndex < wakeupEndpoints.length) {
            const endpoint = wakeupEndpoints[endpointIndex++];
            console.log(`Attempting to wake up service with endpoint: ${endpoint}`);
            
            fetch(endpoint, {
              method: 'GET',
              mode: 'cors',
              credentials: 'omit',
              headers: {
                'Accept': '*/*',
                'Cache-Control': 'no-cache',
                'Origin': window.location.origin,
                'Connection': 'close'
              }
            }).catch(() => {
              // Ignore errors - this is just to wake up the service
            });
            
            // Try next endpoint after delay
            setTimeout(tryNextEndpoint, 2000);
          }
        };
        
        // Start the wakeup process
        tryNextEndpoint();
        
        // Notify the user
        handlers.onError?.(new Error('Backend service may be hibernating. Attempting to wake it up, which may take up to 40 seconds. Please wait...'));
        return;
      }
      
      // Count retries to avoid infinite retry loop
      connectionRetryCount++;
      
      if (connectionRetryCount >= MAX_RETRIES) {
        console.error(`Failed to connect after ${MAX_RETRIES} attempts, giving up`);
        
        try {
          socket?.removeAllListeners();
          socket?.disconnect();
          socket?.close();
          socket = null;
        } catch (e) {
          console.warn('Error during socket cleanup after max retries:', e);
        }
        
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
      isWakingUpRender = false;
      badFileDescriptorCount = 0; // Reset counter on successful reconnection
      handlers.onReconnect?.();
      
      // Restart heartbeat after reconnection
      startHeartbeat();
    });

    socket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnect error:', error);
      
      // Check for bad file descriptor errors during reconnection
      if (error && error.message && (error.message.includes('Bad file descriptor') || error.message.includes('EBADF'))) {
        badFileDescriptorCount++;
        console.log(`Bad file descriptor error during reconnection (${badFileDescriptorCount} occurrences)`);
        
        // For bad file descriptor errors during reconnection, we might need to recreate the socket
        if (badFileDescriptorCount >= 3) {
          console.log('Too many bad file descriptor errors during reconnection, recreating socket');
          
          try {
            socket?.removeAllListeners();
            socket?.disconnect();
            socket?.close();
            socket = null;
            
            // Wait before recreating
            setTimeout(() => {
              console.log('Recreating socket after reconnection errors');
              connectSocket(handlers);
            }, 5000);
          } catch (e) {
            console.warn('Error during socket cleanup after reconnection errors:', e);
          }
        }
      }
    });

    socket.on('emotion_result', (data) => {
      console.log('Emotion result:', data);
      handlers.onEmotionResult?.(data);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      
      // Check for dimension mismatch error
      const errorMessage = error.message || 'Unknown error';
      if (errorMessage.includes('width=9 cannot exceed data.shape') || 
          errorMessage.includes('data.shape[axis]=7') ||
          errorMessage.includes('dimension mismatch')) {
        console.log('Detected model dimension mismatch error');
        // Special handling for dimension issues
        handlers.onError?.(new Error(`Model dimension error: ${errorMessage}`));
      } else if (errorMessage.includes('Bad file descriptor') || errorMessage.includes('EBADF')) {
        // Handle bad file descriptor errors
        badFileDescriptorCount++;
        console.log(`Bad file descriptor socket error (${badFileDescriptorCount} occurrences)`);
        
        if (badFileDescriptorCount >= 3) {
          // Reset the socket completely
          try {
            if (socket) {
              console.log('Resetting socket connection due to bad file descriptor errors');
              socket.removeAllListeners();
              socket.disconnect();
              socket.close();
              socket = null;
              
              // Wait before reconnecting
              setTimeout(() => {
                console.log('Recreating socket after bad file descriptor errors');
                connectSocket(handlers);
              }, 5000);
            }
          } catch (e) {
            console.warn('Error during socket reset after bad file descriptor errors:', e);
          }
        }
      } else {
        // Generic error handling
        handlers.onError?.(new Error(errorMessage || 'Unknown error'));
      }
    });

    // Start heartbeat immediately
    startHeartbeat();
  } catch (error) {
    console.error('Error creating socket connection:', error);
    handlers.onError?.(new Error(`Socket creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
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
      
      // Additionally check the socket's internal state
      if (socket.disconnected) {
        console.warn('Socket reports disconnected state despite connected flag being true');
        // Force reconnection in this case
        try {
          socket.connect();
        } catch (e) {
          console.warn('Error attempting to reconnect disconnected socket:', e);
        }
      }
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
    try {
      socket.removeAllListeners(); // Remove all listeners first to prevent any callbacks
      socket.disconnect();
      socket.close();
      socket = null;
    } catch (e) {
      console.warn('Error during socket cleanup:', e);
      socket = null; // Force to null even if there was an error
    }
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
    try {
      socket.emit('audio_stream', {
        audio: audioData,
        metadata: {
          ...metadata || {},
          processAudio: processAudioEnabled
        }
      });
      return true;
    } catch (error) {
      console.error('Error sending audio data:', error);
      return false;
    }
  }
  return false;
};

/**
 * Check if WebSocket is connected
 */
export const isWebSocketConnected = () => {
  return socket?.connected || false;
};
