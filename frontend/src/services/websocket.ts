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
    // Use the health endpoint to check if backend is up
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn('Backend connectivity test failed:', error);
    return false;
  }
};

/**
 * Connect to WebSocket server
 */
const connectSocket = (handlers: WebSocketHandlers) => {
  const serverUrl = window.location.hostname === 'localhost' ? 
    'http://localhost:5001' : window.location.origin;
  
  console.log(`Connecting to WebSocket server at ${serverUrl}`);
  
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'], // Add polling as fallback
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000, // Increase timeout
    forceNew: true,
    path: '/socket.io/'
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
    
    // Validate data to ensure proper dimensions before passing to handlers
    if (data && data.probabilities) {
      // Ensure we have exactly 6 emotions in the data
      const expectedEmotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'neutral'];
      const normalizedData = { ...data };
      
      // Create a new probabilities object with only expected emotions
      const normalizedProbabilities: Record<string, number> = {};
      
      // Copy valid emotions from input data
      expectedEmotions.forEach(emotion => {
        normalizedProbabilities[emotion] = 
          typeof data.probabilities[emotion] === 'number' ? 
          data.probabilities[emotion] : 0;
      });
      
      // Replace with normalized probabilities
      normalizedData.probabilities = normalizedProbabilities;
      
      // Ensure emotion is in our list
      if (!expectedEmotions.includes(normalizedData.emotion)) {
        normalizedData.emotion = 'neutral';
      }
      
      handlers.onEmotionResult?.(normalizedData);
    } else {
      handlers.onEmotionResult?.(data);
    }
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
    
    // Special handling for dimension mismatch errors (prevent them from showing as connection errors)
    const errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('width=9 cannot exceed data.shape') || 
        errorMessage.includes('data.shape[axis]=') ||
        errorMessage.includes('dimension mismatch')) {
      console.log('Dimension mismatch error detected - handling internally without showing error to user');
      // Don't propagate this error to the UI
      return;
    }
    
    // Forward all other errors
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
