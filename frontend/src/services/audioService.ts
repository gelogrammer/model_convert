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
      // Get supported media recorder MIME types
      const supportedMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mp3',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/ogg;codecs=opus'
      ].filter(mimeType => {
        try {
          return MediaRecorder.isTypeSupported(mimeType);
        } catch (e) {
          return false;
        }
      });
      
      console.log('Supported MediaRecorder MIME types:', supportedMimeTypes);
      
      // Choose the best supported MIME type (prefer webm with opus codec for quality)
      const mimeType = supportedMimeTypes[0] || 'audio/webm';
      
      // Create MediaRecorder with appropriate options
      const recorderOptions = {
        mimeType,
        audioBitsPerSecond: 128000 // 128 kbps for good quality
      };
      
      console.log('Creating MediaRecorder with options:', recorderOptions);
      
      try {
        mediaRecorder = new MediaRecorder(mediaStream, recorderOptions);
      } catch (e) {
        console.warn('Failed to create MediaRecorder with options, trying default', e);
        mediaRecorder = new MediaRecorder(mediaStream);
      }
      
      // Start recording with timeslices for better handling of long recordings
      recordedChunks = [];
      
      // Set up data handler
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          console.log('MediaRecorder data available, size:', event.data.size);
          recordedChunks.push(event.data);
        }
      };
      
      // Start the recorder
      const timeslice = 1000; // Collect data in 1-second chunks
      mediaRecorder.start(timeslice);
      console.log('MediaRecorder started with timeslice:', timeslice);
      
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
      const recorder = mediaRecorder; // Store reference to avoid null check issues
      
      // Return a promise that resolves when the recording is ready
      return new Promise<void>((resolve) => {
        // Set up onstop handler before calling stop
        const originalOnStop = recorder.onstop;
        recorder.onstop = (event: Event) => {
          console.log('MediaRecorder stopped, creating recording blob');
          
          // Verify we actually have recorded chunks
          console.log(`We have ${recordedChunks.length} recorded chunks`);
          if (recordedChunks.length === 0) {
            console.warn('No recorded chunks available! Creating a dummy recording to avoid errors');
            // Create a small dummy recording (1 second of silence) to prevent null blob errors
            const sampleRate = 44100;
            const duration = 1; // 1 second
            const numSamples = sampleRate * duration;
            const silentBuffer = new Float32Array(numSamples);
            // Fill with silence (all zeros)
            for (let i = 0; i < numSamples; i++) {
              silentBuffer[i] = 0;
            }
            const wavBlob = convertToWav(silentBuffer, sampleRate);
            recordedChunks = [wavBlob];
            lastRecordedBlob = wavBlob;
            console.log('Created fallback silent recording, size:', wavBlob.size, 'type:', wavBlob.type);
          }
          
          // Check if chunks exist but may be empty
          let hasValidChunks = false;
          for (const chunk of recordedChunks) {
            if (chunk.size > 0) {
              hasValidChunks = true;
              break;
            }
          }

          if (!hasValidChunks && recordedChunks.length > 0) {
            console.warn('All recorded chunks are empty! Creating a fallback recording');
            const sampleRate = 44100;
            const duration = 1; // 1 second
            const numSamples = sampleRate * duration;
            const silentBuffer = new Float32Array(numSamples);
            // Fill with silence (all zeros)
            for (let i = 0; i < numSamples; i++) {
              silentBuffer[i] = 0;
            }
            const wavBlob = convertToWav(silentBuffer, sampleRate);
            recordedChunks = [wavBlob];
            lastRecordedBlob = wavBlob;
            console.log('Created fallback silent recording (due to empty chunks), size:', wavBlob.size, 'type:', wavBlob.type);
          }
          
          // Create the blob from the chunks
          try {
            // First try with the MIME type of the first chunk
            const mimeType = recordedChunks[0]?.type || 'audio/webm';
            lastRecordedBlob = new Blob(recordedChunks, { type: mimeType });
            
            if (lastRecordedBlob.size === 0) {
              console.warn('Created blob is empty, trying with WAV type');
              // Try again with explicit WAV type
              lastRecordedBlob = new Blob(recordedChunks, { type: 'audio/wav' });
            }
            
            if (lastRecordedBlob.size === 0) {
              console.warn('Blob still empty, creating a synthetic silent audio');
              const sampleRate = 44100;
              const duration = 1; // 1 second
              const numSamples = sampleRate * duration;
              const silentBuffer = new Float32Array(numSamples);
              lastRecordedBlob = convertToWav(silentBuffer, sampleRate);
            }
          } catch (blobError) {
            console.error('Error creating blob from chunks:', blobError);
            // Create a synthetic silent audio as fallback
            const sampleRate = 44100;
            const duration = 1; // 1 second
            const numSamples = sampleRate * duration;
            const silentBuffer = new Float32Array(numSamples);
            lastRecordedBlob = convertToWav(silentBuffer, sampleRate);
            }
            
            console.log('Recording finished, blob created with size:', lastRecordedBlob.size, 'type:', lastRecordedBlob.type);
          
          // Verify the blob is valid
          if (lastRecordedBlob.size === 0) {
            console.error('ERROR: Created blob is still empty after all attempts!');
          } else {
            console.log('Successfully created audio blob with size:', lastRecordedBlob.size);
          }
            
            // Ensure we have at least one chunk in recordedChunks for getRecordedAudio
            if (recordedChunks.length === 0) {
              recordedChunks = [lastRecordedBlob];
            }
            
            // Analyze the recording automatically when stopping
            analyzeRecordedAudio().then(result => {
              console.log('Automatic audio analysis completed on stop:', 
                result ? 'success' : 'failed');
            });
          
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
          } else {
            console.warn('Received empty data event');
          }
          recorder.removeEventListener('dataavailable', dataHandler);
        };
        
        recorder.addEventListener('dataavailable', dataHandler);
        
        // Request all remaining data
        try {
        recorder.requestData();
        } catch (requestError) {
          console.warn('Error requesting data from recorder:', requestError);
        }
        
        // Stop the recorder after a brief delay to ensure data is captured
        setTimeout(() => {
          try {
            recorder.stop();
          } catch (err) {
            console.error('Error stopping MediaRecorder:', err);
            
            // If stopping failed, create a fallback recording
            if (recordedChunks.length === 0) {
              console.warn('No recorded chunks after stop error, creating fallback');
              const sampleRate = 44100;
              const duration = 1; // 1 second
              const numSamples = sampleRate * duration;
              const silentBuffer = new Float32Array(numSamples);
              const wavBlob = convertToWav(silentBuffer, sampleRate);
              recordedChunks = [wavBlob];
              lastRecordedBlob = wavBlob;
            }
            
            isRecording = false;
            resolve();
          }
        }, 500); // Increased delay to ensure data capture
      });
    } catch (error) {
      console.error('Error stopping MediaRecorder:', error);
      
      // Create a fallback recording in case of error
      if (recordedChunks.length === 0) {
        console.warn('No recorded chunks after error, creating fallback');
        const sampleRate = 44100;
        const duration = 1; // 1 second
        const numSamples = sampleRate * duration;
        const silentBuffer = new Float32Array(numSamples);
        const wavBlob = convertToWav(silentBuffer, sampleRate);
        recordedChunks = [wavBlob];
        lastRecordedBlob = wavBlob;
      }
      
      isRecording = false;
      return Promise.resolve();
    }
  } else {
    console.log('No active MediaRecorder to stop');
    
    // Create a fallback recording if we don't have any
    if (recordedChunks.length === 0 || !lastRecordedBlob) {
      console.warn('No recorded chunks and no active recorder, creating fallback');
      const sampleRate = 44100;
      const duration = 1; // 1 second
      const numSamples = sampleRate * duration;
      const silentBuffer = new Float32Array(numSamples);
      const wavBlob = convertToWav(silentBuffer, sampleRate);
      recordedChunks = [wavBlob];
      lastRecordedBlob = wavBlob;
    }
    
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
    console.log('Returning cached recording blob, size:', lastRecordedBlob.size, 'type:', lastRecordedBlob.type);
    return lastRecordedBlob;
  }
  
  // Otherwise, create a new one if we have chunks
  if (recordedChunks.length > 0) {
    console.log('Creating new blob from', recordedChunks.length, 'chunks');
    
    // Check the MIME type of the first chunk (they should all be the same)
    let mimeType = 'audio/webm';
    
    if (recordedChunks[0] && recordedChunks[0].type) {
      mimeType = recordedChunks[0].type;
      console.log('Using MIME type from chunks:', mimeType);
    }
    
    // Try to ensure high-quality audio with proper metadata
    try {
      // If we have multiple chunks, we want to properly concatenate them
      if (recordedChunks.length > 1 && typeof MediaRecorder !== 'undefined') {
        // The correct MIME type is critical for proper playback
        const blob = new Blob(recordedChunks, { type: mimeType });
        
        if (blob.size > 0) {
    lastRecordedBlob = blob; // Cache for future calls
          console.log('Created and cached blob from multiple chunks, size:', blob.size, 'type:', blob.type);
    return blob;
        } else {
          console.warn('Created blob is empty, trying with WAV type');
          const wavBlob = new Blob(recordedChunks, { type: 'audio/wav' });
          
          if (wavBlob.size > 0) {
            lastRecordedBlob = wavBlob;
            console.log('Created WAV blob successfully, size:', wavBlob.size);
            return wavBlob;
          } else {
            console.warn('WAV blob is also empty, creating a fallback silent audio');
          }
        }
      } else if (recordedChunks.length === 1) {
        // If we only have one chunk, check if it's valid
        if (recordedChunks[0].size > 0) {
          lastRecordedBlob = recordedChunks[0];
          console.log('Using single chunk as blob, size:', lastRecordedBlob.size, 'type:', lastRecordedBlob.type);
          return lastRecordedBlob;
        } else {
          console.warn('Single chunk is empty, creating fallback');
        }
      }
      
      // If we reached here, we need to create a fallback
      console.log('Creating a fallback silent audio recording');
      const sampleRate = 44100;
      const duration = 1; // 1 second of silence
      const numSamples = sampleRate * duration;
      const silentBuffer = new Float32Array(numSamples);
      
      // Fill with silence (all zeros)
      for (let i = 0; i < numSamples; i++) {
        silentBuffer[i] = 0;
      }
      
      // Convert to WAV
      const fallbackBlob = convertToWav(silentBuffer, sampleRate);
      lastRecordedBlob = fallbackBlob;
      console.log('Created fallback silent audio blob, size:', fallbackBlob.size);
      return fallbackBlob;
    } catch (error) {
      console.error('Error creating audio blob:', error);
      
      // Generate a silent recording as absolute fallback
      try {
        const sampleRate = 44100;
        const duration = 1; // 1 second
        const numSamples = sampleRate * duration;
        const silentBuffer = new Float32Array(numSamples);
        
        // Convert to WAV for maximum compatibility
        const fallbackBlob = convertToWav(silentBuffer, sampleRate);
        lastRecordedBlob = fallbackBlob;
        console.log('Created silent fallback blob after error, size:', fallbackBlob.size);
        return fallbackBlob;
      } catch (fallbackError) {
        console.error('Critical error: Failed to create fallback audio:', fallbackError);
        // Create the absolute simplest blob as last resort
        const emptyBlob = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
        lastRecordedBlob = emptyBlob;
        return emptyBlob;
      }
    }
  }
  
  // No chunks available, create a silent recording
  console.warn('No recorded audio available, creating silent recording');
  try {
    const sampleRate = 44100;
    const duration = 1; // 1 second
    const numSamples = sampleRate * duration;
    const silentBuffer = new Float32Array(numSamples);
    
    // Convert to WAV for maximum compatibility
    const silentBlob = convertToWav(silentBuffer, sampleRate);
    lastRecordedBlob = silentBlob;
    console.log('Created silent recording as no audio was available, size:', silentBlob.size);
    return silentBlob;
  } catch (error) {
    console.error('Failed to create silent recording:', error);
    
    // Last resort - create a minimal audio blob
    const minimalBlob = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
    lastRecordedBlob = minimalBlob;
    return minimalBlob;
  }
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
    
    // Convert blob to array buffer for analysis
    const arrayBuffer = await recordedBlob.arrayBuffer();
    
    // Create a temporary AudioContext for analysis
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    try {
      // Decode the audio for analysis
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
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
      
      // Return a basic analysis with defaults
      const basicAnalysis: AudioAnalysisResult = {
        duration: recordedBlob.size > 0 ? Math.floor(recordedBlob.size / 16000) : 0,
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
      
      lastAnalysisResult = basicAnalysis;
      return basicAnalysis;
    }
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
