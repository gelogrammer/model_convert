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

// Audio recording variables
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let isRecording = false;
let lastRecordedBlob: Blob | null = null;  // Store the last recorded blob for retrieval

// Emotion classification settings
let confidenceThreshold = 0.4;
let useSmoothing = true;

/**
 * Update audio processing and emotion classification settings
 */
export const updateAudioSettings = (settings: {
  confidenceThreshold?: number;
  useSmoothing?: boolean;
}): void => {
  if (settings.confidenceThreshold !== undefined) {
    confidenceThreshold = settings.confidenceThreshold;
  }
  
  if (settings.useSmoothing !== undefined) {
    useSmoothing = settings.useSmoothing;
  }
  
  console.log('Audio settings updated:', { confidenceThreshold, useSmoothing });
};

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
export const startAudioCapture = async (): Promise<boolean> => {
  console.log('startAudioCapture called');
  
  // Check if audio context is initialized, if not try to initialize it
  if (!audioContext) {
    console.log('Audio context not initialized, attempting to initialize...');
    const initialized = await initializeAudioCapture();
    if (!initialized) {
      console.error('Failed to initialize audio context');
      return false;
    }
  }

  if (!audioContext) {
    console.error('Audio context still not initialized after initialization attempt');
    return false;
  }

  // Resume audio context if suspended
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
      console.log('Audio context resumed from suspended state');
    } catch (resumeError) {
      console.error('Error resuming audio context:', resumeError);
      return false;
    }
  }
  
  // Reset tracking variables
  lastSendTime = 0;
  audioChunks = [];
  recordedChunks = []; // Clear previous recording chunks
  lastRecordedBlob = null; // Clear previous recording

  // Start recording
  if (mediaStream) {
    try {
      console.log('Starting MediaRecorder with stream:', mediaStream.id);
      mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('MediaRecorder data available, size:', event.data.size);
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, creating recording blob');
        if (recordedChunks.length > 0) {
          lastRecordedBlob = new Blob(recordedChunks, { type: 'audio/webm' });
          console.log('Recording finished, blob created with size:', lastRecordedBlob.size);
        } else {
          console.warn('MediaRecorder stopped but no chunks were recorded');
        }
      };
      
      // Set a dataavailable event every 1 second to ensure we get data even if stop() is called unexpectedly
      mediaRecorder.start(1000);
      isRecording = true;
      console.log('MediaRecorder started successfully');
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  } else {
    console.error('No media stream available');
    return false;
  }
}

/**
 * Stop audio capture
 */
export const stopAudioCapture = async () => {
  console.log('stopAudioCapture called');
  
  if (audioContext) {
    audioContext.suspend();
  }
  
  // Clear audio chunks
  audioChunks = [];

  // Stop recording
  if (mediaRecorder && isRecording) {
    try {
      console.log('Stopping MediaRecorder...');
      const recorder = mediaRecorder; // Store reference to avoid null check issues
      
      // Return a promise that resolves when the recording is ready
      return new Promise<void>((resolve) => {
        // Set up onstop handler before calling stop
        const originalOnStop = recorder.onstop;
        recorder.onstop = (event: Event) => {
          console.log('MediaRecorder stopped, creating recording blob');
          if (recordedChunks.length > 0) {
            lastRecordedBlob = new Blob(recordedChunks, { type: 'audio/webm' });
            console.log('Recording finished, blob created with size:', lastRecordedBlob.size);
          } else {
            console.warn('MediaRecorder stopped but no chunks were recorded');
          }
          
          // Call original handler if it exists
          if (originalOnStop) {
            originalOnStop.call(recorder, event);
          }
          
          isRecording = false;
          resolve();
        };
        
        // Add a final dataavailable event handler to make sure we get the last bit of audio
        const dataHandler = (event: BlobEvent) => {
          console.log('Final data available event, size:', event.data.size);
          if (event.data.size > 0) {
            recordedChunks.push(event.data);
          }
          recorder.removeEventListener('dataavailable', dataHandler);
        };
        
        recorder.addEventListener('dataavailable', dataHandler);
        
        // Request all remaining data
        recorder.requestData();
        
        // Stop the recorder after a brief delay to ensure data is captured
        setTimeout(() => {
          try {
            recorder.stop();
          } catch (err) {
            console.error('Error stopping MediaRecorder:', err);
            isRecording = false;
            resolve();
          }
        }, 100);
      });
    } catch (error) {
      console.error('Error stopping MediaRecorder:', error);
      isRecording = false;
    }
  } else {
    console.log('No active MediaRecorder to stop');
    return Promise.resolve();
  }
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

  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
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
  recordedChunks = [];
};

/**
 * Process audio data and send to server
 */
const processAudioData = (audioData: Float32Array) => {
  // Don't process data if not actively capturing
  if (!isRecording) {
    return;
  }

  // Analyze audio data
  const { isSpeech, speechRate } = analyzeAudioData(audioData);
  
  // Only send if we detect speech with higher threshold for quality
  if (isSpeech) {
    // Calculate a speech quality score based on energy level
    const energy = calculateRMS(audioData);
    const qualityScore = Math.min(energy * 10, 1); // Normalize to 0-1
    
    // Only process high quality audio to avoid misclassification
    if (qualityScore > 0.15) { // Higher threshold for better quality
      // Include settings and quality metadata
      const metadata = {
        isSpeech,
        speechRate,
        confidenceThreshold,
        useSmoothing,
        qualityScore
      };
      
      // Send to server
      sendAudioDataToServer(audioData, metadata);
    }
  }
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

/**
 * Get recorded audio as blob
 */
export const getRecordedAudio = (): Blob | null => {
  console.log('getRecordedAudio called');
  
  // If we have a lastRecordedBlob, use it
  if (lastRecordedBlob && lastRecordedBlob.size > 0) {
    console.log('Returning cached recording blob, size:', lastRecordedBlob.size);
    return lastRecordedBlob;
  }
  
  // Otherwise, create a new one if we have chunks
  if (recordedChunks.length > 0) {
    console.log('Creating new blob from', recordedChunks.length, 'chunks');
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    lastRecordedBlob = blob; // Cache for future calls
    console.log('Created and cached new blob, size:', blob.size);
    return blob;
  }
  
  console.warn('No recorded audio available');
  return null;
};

/**
 * Check if currently recording
 */
export const isCurrentlyRecording = (): boolean => {
  return isRecording;
};

/**
 * Clear recorded audio chunks
 */
export const clearRecordedAudio = (): void => {
  recordedChunks = [];
};
