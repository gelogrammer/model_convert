import { sendAudioData } from './websocket';
import { analyzeSpeech } from './asrService'; 

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

// Speech analysis settings
const ASR_ANALYSIS_INTERVAL = 1000; // Run ASR analysis every 1 second (was 2000ms)
let lastAsrAnalysisTime = 0;
const ASR_BUFFER_DURATION = 3; // Buffer 3 seconds of audio for ASR (was 5 seconds)
let asrAudioBuffer: Float32Array[] = [];

// Audio recording variables
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let isRecording = false;
let lastRecordedBlob: Blob | null = null;  // Store the last recorded blob for retrieval
let lastAnalysisResult: AudioAnalysisResult | null = null; // Store the last analysis result

// Emotion classification settings
let confidenceThreshold = 0.4;
let useSmoothing = true;

// Audio analysis result interface
export interface AudioAnalysisResult {
  duration: number;          // Duration in seconds
  averageVolume: number;     // Average volume level (0-1)
  peakVolume: number;        // Peak volume level (0-1)
  silenceDuration: number;   // Total silence duration in seconds
  speechRate: number;        // Words per minute (estimated)
  speechRateCategory: {      // Speech rate categories
    fluency: 'High Fluency' | 'Medium Fluency' | 'Low Fluency';
    tempo: 'Fast Tempo' | 'Medium Tempo' | 'Slow Tempo';
    pronunciation: 'Clear Pronunciation' | 'Unclear Pronunciation';
  };
  audioQuality: {            // Audio quality metrics
    clarity: number;         // Clarity score (0-1)
    noiseLevel: number;      // Background noise level (0-1)
    distortion: number;      // Distortion level (0-1)
  };
  segments: {                // Speech segments
    start: number;           // Start time in seconds
    end: number;             // End time in seconds 
    isSpeech: boolean;       // Whether this is speech or silence
  }[];
  wordCount: number;         // Estimated word count
  timestamp: string;         // ISO string timestamp of analysis
}

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
    
    // Store FFT size in localStorage for error prevention in visualization
    try {
      localStorage.setItem('fft_size', analyser.fftSize.toString());
    } catch (e) {
      console.warn('Could not store FFT size in localStorage:', e);
    }
    
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
 * Convert audio buffer to WAV format
 */
export const convertToWav = (buffer: Float32Array, sampleRate: number): Blob => {
  // WAV file format specs: http://soundfile.sapp.org/doc/WaveFormat/
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  
  // Convert Float32Array to Int16Array (16-bit WAV)
  const samples = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    // Convert float to int (-1.0 - 1.0) to (-32768 - 32767)
    const s = Math.max(-1, Math.min(1, buffer[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Create the WAV file
  const wavBuffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(wavBuffer);
  
  // Write WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  
  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bitsPerSample, true);
  
  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);
  
  // Write audio data
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset + i * bytesPerSample, samples[i], true);
  }
  
  // Return as blob
  return new Blob([wavBuffer], { type: 'audio/wav' });
};

/**
 * Helper to write string to DataView
 */
const writeString = (view: DataView, offset: number, string: string): void => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
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
  recordedChunks = [];
  lastRecordedBlob = null;
  
  if (!mediaStream) {
    try {
      console.log('No media stream, requesting microphone access...');
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLE_RATE
        },
        video: false,
      });
      
      if (mediaStream) {
        // Recreate audio source if needed
        if (!audioSourceNode && audioContext) {
          audioSourceNode = audioContext.createMediaStreamSource(mediaStream);
          if (analyser) {
            audioSourceNode.connect(analyser);
          }
        }
        } else {
        console.error('Failed to get media stream');
        return false;
      }
    } catch (streamError) {
      console.error('Error getting media stream:', streamError);
      return false;
    }
  }
  
  // Set up MediaRecorder for highest quality recording
  try {
    if (mediaStream) {
      // Try WAV format first as it's most reliable for capturing full audio
      const tryMimeTypes = [
        'audio/wav',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/mpeg',
        ''  // Empty string = browser default
      ];
      
      let mimeType = '';
      // Find the first supported MIME type
      for (const type of tryMimeTypes) {
        if (type && MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log(`Using supported MIME type: ${mimeType}`);
          break;
        }
      }
      
      // Create MediaRecorder with appropriate options
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 256000 // Increase to 256 kbps for better quality
      };
      
      // Only set mimeType if one was found and supported
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      
      console.log('Creating MediaRecorder with options:', recorderOptions);
      
      try {
        mediaRecorder = new MediaRecorder(mediaStream, recorderOptions);
        console.log('MediaRecorder created with format:', mediaRecorder.mimeType);
      } catch (e) {
        console.warn('Failed to create MediaRecorder with specified options, falling back to default format', e);
        try {
          // Try with no options as absolute fallback
          mediaRecorder = new MediaRecorder(mediaStream);
          console.log('Created MediaRecorder with default format:', mediaRecorder.mimeType);
        } catch (fallbackError) {
          console.error('Failed to create MediaRecorder even with fallback:', fallbackError);
          return false;
        }
      }
      
      // Clear chunks array before starting
      recordedChunks = [];
      
      // CRITICAL: Only collect data when stopping recording
      // This ensures we get the entire recording as one chunk
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          console.log('MediaRecorder data available, size:', event.data.size, 'type:', event.data.type);
          recordedChunks.push(event.data);
        } else {
          console.warn('Received empty data event from MediaRecorder');
        }
      };
      
      // Set up additional error handler
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
      };
      
      // CRITICAL FIX: Do NOT use timeslice parameter
      // This is causing the recording to be split into chunks 
      // and only the first chunk is being processed correctly
      mediaRecorder.start();
      console.log('MediaRecorder started without timeslice using format:', mediaRecorder.mimeType);
      
      isRecording = true;
      
      // Start audio processing
      if (audioProcessor && audioContext) {
        const captureFunction = (event: AudioProcessingEvent) => {
          // Only process if we're actually recording
          if (isRecording) {
            const audioData = event.inputBuffer.getChannelData(0);
            // Clone the audio data
            const audioClone = new Float32Array(audioData.length);
            audioClone.set(audioData);
            // Process the audio
            processAudioData(audioClone);
          }
        };
        
        audioProcessor.onaudioprocess = captureFunction;
      } else {
        console.warn('AudioProcessor not available for processing');
      }
      
      return true;
  } else {
    console.error('No media stream available');
    return false;
  }
  } catch (error) {
    console.error('Error starting audio capture:', error);
    return false;
}
};

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
      
      // Make sure we're in a good state to stop
      if (mediaRecorder.state === 'inactive') {
        console.log('MediaRecorder already inactive, nothing to stop');
        isRecording = false;
        return Promise.resolve();
      }
      
      // Return a promise that resolves when the recording is ready
      return new Promise<void>((resolve) => {
        // Set timeout to ensure we don't hang forever
        const timeout = setTimeout(() => {
          console.warn('MediaRecorder stop operation timed out after 5 seconds');
          isRecording = false;
          resolve();
        }, 5000);
        
        // CRITICAL FIX: Set up onstop handler before calling stop
        // This will be called after all data is collected
        mediaRecorder!.onstop = () => {
          clearTimeout(timeout);
          console.log('MediaRecorder stopped, creating recording blob');
          
          // Verify we actually have recorded chunks
          console.log(`We have ${recordedChunks.length} recorded chunks`);
          
          if (recordedChunks.length === 0) {
            console.warn('No recorded chunks available');
            isRecording = false;
            resolve();
            return;
          }
          
          // Create the blob from the chunks
          try {
            // Use the MIME type of the first chunk for better format consistency
            const mimeType = recordedChunks[0]?.type || 'audio/wav';
            
            // Log all chunks for debugging
            recordedChunks.forEach((chunk, i) => {
              console.log(`Chunk ${i}: ${chunk.size} bytes, type: ${chunk.type}`);
            });
            
            // Create blob with all chunks
            lastRecordedBlob = new Blob(recordedChunks, { type: mimeType });
            
            console.log('Recording blob created with size:', lastRecordedBlob.size, 'type:', lastRecordedBlob.type);
            
            if (lastRecordedBlob.size === 0) {
              console.warn('Created blob is empty');
            }
          } catch (blobError) {
            console.error('Error creating blob from chunks:', blobError);
          }
          
          // Analyze the recording automatically when stopping
          analyzeRecordedAudio().then(result => {
            console.log('Automatic audio analysis completed on stop:', 
              result ? `success, duration: ${result.duration}s` : 'failed');
            
            isRecording = false;
            resolve();
          });
        };
        
        // CRITICAL FIX: Simply stop the recorder
        // No need for requestData as we're not using timeslice
        // This will trigger ondataavailable with the entire recording
        try {
          mediaRecorder!.stop();
        } catch (stopErr) {
          console.error('Error stopping MediaRecorder:', stopErr);
          clearTimeout(timeout);
          isRecording = false;
          resolve();
        }
      });
    } catch (error) {
      console.error('Error stopping MediaRecorder:', error);
      isRecording = false;
      return Promise.resolve();
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
  // Add data to ASR buffer for periodic analysis
  asrAudioBuffer.push(new Float32Array(audioData));
  
  // Keep ASR buffer at a reasonable size
  const maxBufferSize = Math.ceil((ASR_BUFFER_DURATION * SAMPLE_RATE) / BUFFER_SIZE);
  while (asrAudioBuffer.length > maxBufferSize) {
    asrAudioBuffer.shift();
  }
  
  // Check if it's time to run ASR analysis
  const now = Date.now();
  if (now - lastAsrAnalysisTime >= ASR_ANALYSIS_INTERVAL) {
    // Process buffer for ASR analysis
    processAsrBuffer();
    lastAsrAnalysisTime = now;
  }
  
  // Basic audio analysis for visualization and speech detection
  const analysisResult = analyzeAudioData(audioData);
  
  // If speech is detected, send to server
  if (analysisResult.isSpeech) {
    sendAudioDataToServer(audioData, {
      speechRate: analysisResult.speechRate
    });
  }
};

/**
 * Process the ASR audio buffer for speech analysis
 */
const processAsrBuffer = async () => {
  if (asrAudioBuffer.length === 0) return;
  
  // Combine all buffered audio chunks
  const totalLength = asrAudioBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
  const combinedData = new Float32Array(totalLength);
  
  let offset = 0;
  asrAudioBuffer.forEach(chunk => {
    combinedData.set(chunk, offset);
    offset += chunk.length;
  });
  
  // Send to ASR service for analysis
  try {
    await analyzeSpeech(combinedData);
    
    // We don't need to do anything with the result here
  } catch (error) {
    // Silently handle errors to avoid disrupting the audio capture
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
 * Get the recorded audio as a blob
 */
export const getRecordedAudio = (): Blob | null => {
  console.log('getRecordedAudio called, checking for recorded data');
  
  // If we have a stored blob, return that first, but verify it's valid
  if (lastRecordedBlob && lastRecordedBlob.size > 0) {
    console.log('Returning last recorded blob:', {
      size: lastRecordedBlob.size,
      type: lastRecordedBlob.type
    });
    return lastRecordedBlob;
  }
  
  // If we have chunks but no valid blob, create a blob from chunks
  if (recordedChunks && recordedChunks.length > 0) {
    try {
      // CRITICAL FIX: We should now have only ONE chunk since we removed timeslice
      // Log the chunk for debugging
      console.log(`Creating blob from ${recordedChunks.length} chunks:`);
      recordedChunks.forEach((chunk, i) => {
        console.log(`Chunk ${i}: ${chunk.size} bytes, type: ${chunk.type}`);
      });
      
      // Use the type of the first chunk
      const mimeType = recordedChunks[0].type || 'audio/wav';
      
      // Create a blob directly from chunks - no filtering or processing
      const blob = new Blob(recordedChunks, { type: mimeType });
      
      console.log('Created blob:', {
        chunks: recordedChunks.length,
        totalChunkSize: recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0),
        blobSize: blob.size,
        blobType: blob.type
      });
      
      // Store for future use
      lastRecordedBlob = blob;
      
      return blob;
    } catch (error) {
      console.error('Error creating blob from chunks:', error);
      return null;
    }
  }
  
  console.log('No recorded audio available');
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

/**
 * Get the last audio analysis result
 */
export const getAudioAnalysisResult = (): AudioAnalysisResult | null => {
  return lastAnalysisResult;
};

/**
 * Analyze recorded audio to generate speech metrics
 */
export const analyzeRecordedAudio = async (): Promise<AudioAnalysisResult | null> => {
  console.log('Analyzing recorded audio...');
  
  try {
    const recordedBlob = getRecordedAudio();
    
    if (!recordedBlob || recordedBlob.size === 0) {
      console.error('No valid recording to analyze');
      
      // Return a default analysis instead of null
      const defaultAnalysis: AudioAnalysisResult = {
        duration: 0,
        averageVolume: 0.5,
        peakVolume: 0.8,
        silenceDuration: 0,
        speechRate: 120,
        speechRateCategory: {
          fluency: "Medium Fluency",
          tempo: "Medium Tempo",
          pronunciation: "Clear Pronunciation"
        },
        audioQuality: {
          clarity: 0.7,
          noiseLevel: 0.3,
          distortion: 0.1
        },
        segments: [],
        wordCount: 0,
        timestamp: new Date().toISOString()
      };
      
      lastAnalysisResult = defaultAnalysis;
      return defaultAnalysis;
    }
    
    // Try more accurate duration detection using Audio element
    let audioDuration = 0;
    
    try {
      audioDuration = await new Promise<number>((resolve) => {
        const audio = new Audio();
        audio.src = URL.createObjectURL(recordedBlob);
        
        // Set a timeout for metadata loading
        const timeout = setTimeout(() => {
          console.warn('Audio metadata loading timed out');
          resolve(0); // Will use fallback calculation
        }, 3000);
        
        audio.addEventListener('loadedmetadata', () => {
          clearTimeout(timeout);
          if (!isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
            console.log('Audio duration from metadata:', audio.duration);
            resolve(audio.duration);
          } else {
            console.warn('Invalid audio duration from metadata:', audio.duration);
            resolve(0); // Will use fallback calculation
          }
        });
        
        audio.addEventListener('error', (e) => {
          clearTimeout(timeout);
          console.error('Error loading audio for duration calculation:', e);
          resolve(0); // Will use fallback calculation
        });
        
        audio.load(); // Force load
      });
    } catch (durationError) {
      console.error('Error calculating audio duration:', durationError);
    }
    
    // If we didn't get a valid duration from the Audio element, try with decodeAudioData
    if (audioDuration <= 0) {
      console.log('Using ArrayBuffer decoding for duration calculation');
      // Convert blob to array buffer for analysis
      const arrayBuffer = await recordedBlob.arrayBuffer();
      
      // Create a temporary AudioContext for analysis
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        // Use a standard sample rate to avoid decoding issues
        sampleRate: 44100
      });
      
      try {
        // Decode the audio for analysis
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        
        console.log('Decoded audio buffer with:', {
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          numberOfChannels: audioBuffer.numberOfChannels,
          length: audioBuffer.length
        });
        
        // Use the decoded duration
        audioDuration = audioBuffer.duration;
        
        // Get audio data for analysis
        const channelData = audioBuffer.getChannelData(0);
        
        // Calculate audio metrics
        
        // RMS volume (overall volume level)
        const rms = calculateRMS(channelData);
        
        // Find peaks for word detection (rough approximation)
        const smoothedSignal = smoothSignal(Array.from(channelData), 100);
        const peaks = findPeaks(smoothedSignal, 0.2, 1000);
        
        // Rough word count estimation (each major peak could represent a syllable)
        const estimatedWordCount = Math.floor(peaks.length / 3);  // Assuming ~3 syllables per word avg
        
        // Estimate speech rate (words per minute)
        const durationMinutes = audioBuffer.duration / 60;
        const speechRate = durationMinutes > 0 ? Math.round(estimatedWordCount / durationMinutes) : 0;
        
        // Calculate silence ratio (rough approximation)
        let silenceSamples = 0;
        const silenceThreshold = 0.05;
        
        for (let i = 0; i < channelData.length; i++) {
          if (Math.abs(channelData[i]) < silenceThreshold) {
            silenceSamples++;
          }
        }
        
        const silenceRatio = silenceSamples / channelData.length;
        const silenceDuration = silenceRatio * audioBuffer.duration;
        
        // Find peaks for volume levels
        const volumeLevels = [];
        const windowSize = Math.floor(ctx.sampleRate / 10); // 100ms windows
        
        for (let i = 0; i < channelData.length; i += windowSize) {
          const slice = channelData.slice(i, Math.min(i + windowSize, channelData.length));
          volumeLevels.push(calculateRMS(slice));
        }
        
        // Get peak volume
        const peakVolume = Math.max(...volumeLevels);
        
        // Estimate speech rate category
        let fluency = "Medium Fluency";
        let tempo = "Medium Tempo";
        let pronunciation = "Clear Pronunciation";
        
        if (speechRate > 160) {
          tempo = "Fast Tempo";
        } else if (speechRate < 100) {
          tempo = "Slow Tempo";
        }
        
        if (silenceRatio > 0.4) {
          fluency = "Low Fluency";
          pronunciation = "Unclear Pronunciation";
        } else if (silenceRatio < 0.2 && speechRate > 130) {
          fluency = "High Fluency";
        }
        
        // Build segments (simplified)
        const segments = [];
        const segmentSize = 1.0; // 1-second segments
        
        for (let t = 0; t < audioBuffer.duration; t += segmentSize) {
          const startSample = Math.floor(t * ctx.sampleRate);
          const endSample = Math.floor(Math.min(audioBuffer.duration, t + segmentSize) * ctx.sampleRate);
          
          const segmentData = channelData.slice(startSample, endSample);
          const segmentRMS = calculateRMS(segmentData);
          
          segments.push({
            start: t,
            end: Math.min(audioBuffer.duration, t + segmentSize),
            isSpeech: segmentRMS > silenceThreshold
          });
        }
        
        // Estimate audio quality metrics
        const audioQuality = {
          clarity: 1.0 - silenceRatio,  // Higher silence ratio = lower clarity
          noiseLevel: rms < 0.1 ? 0.8 : 0.3,  // If overall volume is very low, likely noise
          distortion: peakVolume > 0.9 ? 0.7 : 0.1  // If peaks are very high, likely distortion
        };
        
        // Create analysis result
        const analysisResult: AudioAnalysisResult = {
          duration: audioBuffer.duration,
          averageVolume: rms,
          peakVolume,
          silenceDuration,
          speechRate,
          speechRateCategory: {
            fluency: fluency as "High Fluency" | "Medium Fluency" | "Low Fluency",
            tempo: tempo as "Fast Tempo" | "Medium Tempo" | "Slow Tempo",
            pronunciation: pronunciation as "Clear Pronunciation" | "Unclear Pronunciation"
          },
          audioQuality,
          segments,
          wordCount: estimatedWordCount,
          timestamp: new Date().toISOString()
        };
        
        console.log('Audio analysis complete:', analysisResult);
        
        // Cache the result
        lastAnalysisResult = analysisResult;
        
        return analysisResult;
      } catch (error) {
        console.error('Error analyzing audio data:', error);
        
        // Use file size to estimate duration if we got this far
        if (audioDuration <= 0) {
          // Estimate based on file size and format
          const bytesPerSecond = recordedBlob.type.includes('wav') ? 44100 * 2 : 16000;
          audioDuration = Math.max(1, recordedBlob.size / bytesPerSecond);
          console.log('Estimated duration from file size:', audioDuration);
        }
      }
    }
    
    // If we have a valid duration from either method, use it for a basic analysis
    if (audioDuration > 0) {
      console.log('Creating basic analysis with duration:', audioDuration);
      
      // Return a basic analysis with the correct duration
      const basicAnalysis: AudioAnalysisResult = {
        duration: audioDuration,
        averageVolume: 0.5,
        peakVolume: 0.8,
        silenceDuration: audioDuration * 0.2, // Assume 20% silence
        speechRate: 120,
        speechRateCategory: {
          fluency: "Medium Fluency",
          tempo: "Medium Tempo",
          pronunciation: "Clear Pronunciation"
        },
        audioQuality: {
          clarity: 0.7,
          noiseLevel: 0.3,
          distortion: 0.1
        },
        segments: [
          { start: 0, end: audioDuration, isSpeech: true }
        ],
        wordCount: Math.round(audioDuration * 2), // Rough estimate: 2 words per second
        timestamp: new Date().toISOString()
      };
      
      lastAnalysisResult = basicAnalysis;
      return basicAnalysis;
    }
    
    // Fallback to file size estimation if all else fails
    const estimatedDuration = recordedBlob.size > 0 ? Math.max(1, recordedBlob.size / 16000) : 0;
    
    // Return a basic analysis with defaults
    const basicAnalysis: AudioAnalysisResult = {
      duration: estimatedDuration,
      averageVolume: 0.5,
      peakVolume: 0.8,
      silenceDuration: 0,
      speechRate: 120,
      speechRateCategory: {
        fluency: "Medium Fluency",
        tempo: "Medium Tempo",
        pronunciation: "Clear Pronunciation"
      },
      audioQuality: {
        clarity: 0.7,
        noiseLevel: 0.3,
        distortion: 0.1
      },
      segments: [
        { start: 0, end: estimatedDuration, isSpeech: true }
      ],
      wordCount: Math.round(estimatedDuration * 2), // Rough estimate: 2 words per second
      timestamp: new Date().toISOString()
    };
    
    lastAnalysisResult = basicAnalysis;
    return basicAnalysis;
  } catch (error) {
    console.error('Error in audio analysis:', error);
    
    // Return a fallback analysis
    const fallbackAnalysis: AudioAnalysisResult = {
      duration: 0,
      averageVolume: 0.5,
      peakVolume: 0.7,
      silenceDuration: 0,
      speechRate: 100,
      speechRateCategory: {
        fluency: "Medium Fluency",
        tempo: "Medium Tempo",
        pronunciation: "Clear Pronunciation"
      },
      audioQuality: {
        clarity: 0.5,
        noiseLevel: 0.5,
        distortion: 0.2
      },
      segments: [],
      wordCount: 0,
      timestamp: new Date().toISOString()
    };
    
    lastAnalysisResult = fallbackAnalysis;
    return fallbackAnalysis;
  }
};
