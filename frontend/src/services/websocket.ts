import { io, Socket } from 'socket.io-client';

// WebSocket connection
let socket: Socket | null = null;
let heartbeatInterval: number | null = null;

// Get backend URL from environment variables
const getBackendUrl = () => {
  const url = import.meta.env.VITE_BACKEND_URL || '/';
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

  // Create new connection using backend URL from environment with more resilient options
  socket = io(getBackendUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: true,
    forceNew: true
  });

  // Setup event handlers
  socket.on('connect', () => {
    console.log('WebSocket connected');
    handlers.onConnect?.();
    
    // Start heartbeat after connection
    startHeartbeat();
  });

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    handlers.onDisconnect?.();
    
    // Clear heartbeat on disconnect
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`WebSocket reconnect attempt ${attempt}`);
    handlers.onReconnectAttempt?.(attempt);
  });

  socket.on('reconnect', () => {
    console.log('WebSocket reconnected');
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

  return socket;
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
};

/**
 * Send audio data to server
 */
export const sendAudioData = (audioData: string, metadata?: any) => {
  if (socket && socket.connected) {
    socket.emit('audio_stream', {
      audio: audioData,
      metadata: metadata || {}
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
