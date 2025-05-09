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
  
  try {
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
      try {
        // Validate and normalize the emotion data before passing it to handlers
        const validatedData = validateEmotionData(data);
        handlers.onEmotionResult?.(validatedData);
      } catch (error) {
        console.error('Error processing emotion result:', error);
        // Don't pass invalid data to handlers
      }
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      
      // Check for dimension mismatch error
      const errorMessage = error.message || 'Unknown error';
      if (errorMessage.includes('width=9 cannot exceed data.shape') || 
          errorMessage.includes('data.shape[axis]=') ||
          errorMessage.includes('dimension mismatch')) {
        console.log('Detected model dimension mismatch error');
        // Special handling for dimension issues
        handlers.onError?.(new Error(`Model dimension error: ${errorMessage}`));
        
        // Set a local storage flag to indicate this error happened
        try {
          localStorage.setItem('dimensionMismatchDetected', 'true');
        } catch (e) {
          console.error('Failed to set local storage flag:', e);
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

/**
 * Validate and normalize emotion data to ensure consistent dimensions
 */
const validateEmotionData = (data: any) => {
  if (!data) return null;
  
  // Standard emotions we expect from the model
  const standardEmotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'];
  
  // Check if probabilities exist and have the right structure
  if (!data.probabilities) {
    // Create default empty probabilities if missing
    data.probabilities = standardEmotions.reduce((acc: Record<string, number>, emotion) => {
      acc[emotion] = 0;
      return acc;
    }, {});
  } else {
    // Ensure all standard emotions are present
    standardEmotions.forEach(emotion => {
      if (typeof data.probabilities[emotion] !== 'number') {
        data.probabilities[emotion] = 0;
      }
    });
    
    // Remove any emotions that aren't in our standard list
    const extraEmotions = Object.keys(data.probabilities).filter(
      emotion => !standardEmotions.includes(emotion)
    );
    
    extraEmotions.forEach(emotion => {
      delete data.probabilities[emotion];
    });
  }
  
  // Ensure emotion field is valid
  if (!data.emotion || !standardEmotions.includes(data.emotion)) {
    // Find highest probability emotion
    const highestEmotion = Object.entries(data.probabilities)
      .reduce((highest, [emotion, prob]) => {
        return (prob as number) > highest.prob ? { emotion, prob: prob as number } : highest;
      }, { emotion: 'neutral', prob: 0 });
    
    data.emotion = highestEmotion.emotion;
  }
  
  return data;
};
