import { io, Socket } from 'socket.io-client';

// WebSocket connection
let socket: Socket | null = null;
let heartbeatInterval: number | null = null;

// Always connect directly to Railway for WebSockets
const getBackendUrl = () => {
  // Always use the direct Railway URL for WebSocket connections
  const url = 'https://talktwanalyzer-production.up.railway.app';
  console.log('WebSocket connecting to:', url);
  return url;
};

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
    // Create new connection using direct Railway URL
    socket = io(getBackendUrl(), {
      path: '/socket.io',
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionAttempts: 100,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 60000,
      autoConnect: true,
      forceNew: true
    });

    // Logging for debugging
    console.log('Socket.IO instance created, attempting connection...');

    // Setup event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected successfully!');
      handlers.onConnect?.();
      
      // Start heartbeat after connection
      startHeartbeat();
    });

    socket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected. Reason: ${reason}`);
      handlers.onDisconnect?.();
      
      // Clear heartbeat on disconnect
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`WebSocket reconnect attempt ${attempt}...`);
      handlers.onReconnectAttempt?.(attempt);
    });

    socket.on('reconnect', () => {
      console.log('WebSocket reconnected successfully!');
      handlers.onReconnect?.();
      
      // Restart heartbeat after reconnection
      startHeartbeat();
    });

    socket.on('emotion_result', (data) => {
      console.log('Emotion result received:', data);
      handlers.onEmotionResult?.(data);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      handlers.onError?.(new Error(error.message || 'Unknown error'));
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      console.log('Connection error details:', error.message);
      handlers.onError?.(new Error(`Connection error: ${error.message || 'Unknown'}`));
    });

    // Log connection status
    console.log('Current socket status:', socket.connected ? 'Connected' : 'Disconnecting');

    // Start heartbeat immediately
    startHeartbeat();

    return socket;
  } catch (error) {
    console.error('Error initializing WebSocket:', error);
    handlers.onError?.(error instanceof Error ? error : new Error('Unknown error'));
    return null;
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
      console.log('Heartbeat ping sent');
    }
  }, 10000); // Send heartbeat every 10 seconds
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
};

/**
 * Check if WebSocket is connected
 */
export const isWebSocketConnected = () => {
  return socket?.connected || false;
};

/**
 * Send audio data through WebSocket
 */
export const sendAudioData = (audioData: any, metadata?: any) => {
  if (socket && socket.connected) {
    socket.emit('audio_stream', { audio: audioData, metadata });
    return true;
  }
  return false;
};
