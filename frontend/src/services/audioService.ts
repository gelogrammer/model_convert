import { sendAudioData } from './websocket';

// Audio context and related variables
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let analyser: AnalyserNode | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let audioSourceNode: MediaStreamAudioSourceNode | null = null;

// Audio capture settings
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

// Data tracking for throttling
let lastSendTime = 0;
const SEND_INTERVAL = 200; // Send every 200ms to reduce server load
let audioChunks: Float32Array[] = [];
const MAX_CHUNKS = 5; // Limit the number of chunks to avoid memory issues

/**
 * Initialize audio capture
 */
export const initializeAudioCapture = async (): Promise<boolean> => {
  try {
    // Request microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    // Create audio context
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: SAMPLE_RATE,
    });

    // Create analyser for visualization
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    // Create source from media stream
    audioSourceNode = audioContext.createMediaStreamSource(mediaStream);
    audioSourceNode.connect(analyser);

    // Create script processor for audio processing
    audioProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    analyser.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);

    // Process audio data with throttling
    audioProcessor.onaudioprocess = (event) => {
      const audioData = event.inputBuffer.getChannelData(0);
      
      // Clone the data since it's reused by the browser
      const audioClone = new Float32Array(audioData.length);
      audioClone.set(audioData);
      
      // Add to queue
      audioChunks.push(audioClone);
      
      // Limit the queue size
      if (audioChunks.length > MAX_CHUNKS) {
        audioChunks.shift();
      }
      
      // Check if enough time has passed to send data
      const now = Date.now();
      if (now - lastSendTime >= SEND_INTERVAL) {
        if (audioChunks.length > 0) {
          // Combine all chunks
          const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const combinedData = new Float32Array(totalLength);
          
          let offset = 0;
          audioChunks.forEach(chunk => {
            combinedData.set(chunk, offset);
            offset += chunk.length;
          });
          
          // Process and send data
          processAudioData(combinedData);
          
          // Clear chunks
          audioChunks = [];
          
          // Update last send time
          lastSendTime = now;
        }
      }
    };

    return true;
  } catch (error) {
    console.error('Error initializing audio capture:', error);
    return false;
  }
};

/**
 * Start audio capture
 */
export const startAudioCapture = () => {
  if (!audioContext) {
    return false;
  }

  // Resume audio context if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  // Reset tracking variables
  lastSendTime = 0;
  audioChunks = [];

  return true;
};

/**
 * Stop audio capture
 */
export const stopAudioCapture = () => {
  if (audioContext) {
    audioContext.suspend();
  }
  
  // Clear audio chunks
  audioChunks = [];
};

/**
 * Clean up audio resources
 */
export const cleanupAudio = () => {
  // Stop any processing
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor = null;
  }

  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }
  
  if (audioSourceNode) {
    audioSourceNode.disconnect();
    audioSourceNode = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // Clear audio chunks
  audioChunks = [];
};

/**
 * Process audio data and send to server
 */
const processAudioData = (audioData: Float32Array) => {
  // Apply more sophisticated speech detection
  const speechAnalysis = analyzeAudioData(audioData);
  
  if (!speechAnalysis.isSpeech) {
    // Still send a small packet to keep the connection active
    // This helps the server know we're still here even if silent
    const smallSample = new Float32Array(128).fill(0);
    sendAudioDataToServer(smallSample);
    return;
  }
  
  // Add speech rate metadata to the audio data
  sendAudioDataToServer(audioData, {
    speechRate: speechAnalysis.speechRate,
    isSpeech: true
  });
};

/**
 * Analyze audio data for speech characteristics
 * Based on the VOICE-TEST-MODEL.py implementation
 */
const analyzeAudioData = (audioData: Float32Array): { 
  isSpeech: boolean;
  speechRate: number;
} => {
  // Speech detection with energy threshold
  const energy = calculateRMS(audioData);
  const isSpeech = energy > 0.01;
  
  if (!isSpeech) {
    return { isSpeech: false, speechRate: 0 };
  }
  
  // Calculate speech rate using energy peaks (syllable detection)
  // Smooth the energy signal first
  const smoothedEnergy = smoothSignal(Array.from(audioData).map(Math.abs), 10);
  
  // Find peaks in the smoothed energy (syllables)
  const peaks = findPeaks(smoothedEnergy, 0.05, Math.floor(SAMPLE_RATE * 0.1));
  
  // Count syllables
  const numSyllables = peaks.length;
  
  // Calculate speech duration (excluding silence)
  const silenceThreshold = 0.01;
  const isSilence = smoothedEnergy.map(e => e < silenceThreshold);
  
  // Group consecutive silence frames
  const silenceGroups: number[][] = [];
  let currentGroup: number[] = [];
  
  isSilence.forEach((silent, i) => {
    if (silent) {
      currentGroup.push(i);
    } else if (currentGroup.length > 0) {
      silenceGroups.push([...currentGroup]);
      currentGroup = [];
    }
  });
  
  if (currentGroup.length > 0) {
    silenceGroups.push(currentGroup);
  }
  
  // Filter out short silence groups
  const minSilenceDuration = 0.2; // seconds
  const minFrames = Math.floor(SAMPLE_RATE * minSilenceDuration);
  const longSilenceFrames = silenceGroups
    .filter(group => group.length >= minFrames)
    .reduce((sum, group) => sum + group.length, 0);
  
  // Calculate speech duration
  const totalFrames = audioData.length;
  const speechFrames = totalFrames - longSilenceFrames;
  const speechDuration = speechFrames / SAMPLE_RATE;
  
  // Calculate speech rate
  const speechRate = speechDuration > 0 && numSyllables > 0
    ? numSyllables / speechDuration
    : 0;
  
  return {
    isSpeech,
    speechRate
  };
};

/**
 * Calculate Root Mean Square of audio data
 */
const calculateRMS = (audioData: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  return Math.sqrt(sum / audioData.length);
};

/**
 * Smooth a signal using a moving average
 */
const smoothSignal = (signal: number[], windowSize: number): number[] => {
  const result = new Array(signal.length).fill(0);
  
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let count = 0;
    
    for (let j = Math.max(0, i - windowSize); j < Math.min(signal.length, i + windowSize + 1); j++) {
      sum += signal[j];
      count++;
    }
    
    result[i] = sum / count;
  }
  
  return result;
};

/**
 * Find peaks in a signal
 */
const findPeaks = (signal: number[], minHeight: number, minDistance: number): number[] => {
  const peaks: number[] = [];
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > minHeight && 
        signal[i] > signal[i-1] && 
        signal[i] > signal[i+1]) {
      
      // Check minimum distance from previous peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      } else if (signal[i] > signal[peaks[peaks.length - 1]]) {
        // Replace previous peak if current one is higher
        peaks[peaks.length - 1] = i;
      }
    }
  }
  
  return peaks;
};

/**
 * Send audio data to server
 */
const sendAudioDataToServer = (audioData: Float32Array, metadata?: any) => {
  // Convert to base64
  const buffer = new ArrayBuffer(audioData.length * 4);
  const view = new DataView(buffer);
  
  for (let i = 0; i < audioData.length; i++) {
    view.setFloat32(i * 4, audioData[i], true);
  }
  
  const blob = new Blob([view], { type: 'application/octet-stream' });
  
  // Convert to base64
  const reader = new FileReader();
  reader.onloadend = () => {
    const base64data = reader.result as string;
    // Send to server with metadata
    sendAudioData(base64data, metadata);
  };
  
  reader.readAsDataURL(blob);
};

/**
 * Get audio visualization data
 */
export const getAudioVisualizationData = (): Uint8Array | null => {
  if (!analyser) {
    return null;
  }
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  return dataArray;
};
