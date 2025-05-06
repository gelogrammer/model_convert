/**
 * ASR (Automatic Speech Recognition) service for real-time speech analysis
 * Provides speech rate, fluency, tempo, and pronunciation metrics
 */

import { convertToWav } from './audioService';
import { getApiUrl } from './apiConfig';

// Metrics storage for tracking speech patterns over time
interface SpeechMetrics {
  timestamp: Date;
  fluency: string;
  fluencyConfidence: number;
  tempo: string;
  tempoConfidence: number;
  pronunciation: string;
  pronunciationConfidence: number;
  speechRate: number;
}

// Constants for speech categories
export const FLUENCY_CATEGORIES = ["High Fluency", "Medium Fluency", "Low Fluency"];
export const TEMPO_CATEGORIES = ["Fast Tempo", "Medium Tempo", "Slow Tempo"];
export const PRONUNCIATION_CATEGORIES = ["Clear Pronunciation", "Unclear Pronunciation"];

// Storage for metrics history
let metricsHistory: SpeechMetrics[] = [];
const MAX_HISTORY_LENGTH = 100;

// Configuration - make real-time analysis more responsive
const ANALYSIS_INTERVAL = 500; // Reduce to 500ms for much more responsive updates
let lastAnalysisTime = 0;
let isProcessing = false;
let processingQueue: Float32Array[] = []; // Queue for audio data waiting to be processed
const MAX_QUEUE_LENGTH = 5; // Increase queue length to handle more data

/**
 * Analyze speech audio data using backend ASR model
 */
export const analyzeSpeech = async (audioData: Float32Array): Promise<{
  fluency: { category: string; confidence: number };
  tempo: { category: string; confidence: number };
  pronunciation: { category: string; confidence: number };
  speechRate: number;
} | null> => {
  // Skip if recently processed to prevent overloading server
  const now = Date.now();
  
  // Add to queue if processing is ongoing
  if (isProcessing) {
    // Add to queue if not too full
    if (processingQueue.length < MAX_QUEUE_LENGTH) {
      processingQueue.push(new Float32Array(audioData));
    }
    return null;
  }
  
  // Allow more frequent analysis to improve responsiveness
  if (now - lastAnalysisTime < ANALYSIS_INTERVAL) {
    // Add to queue for later processing
    if (processingQueue.length < MAX_QUEUE_LENGTH) {
      processingQueue.push(new Float32Array(audioData));
    }
    return null;
  }
  
  // Mark as processing to prevent concurrent requests
  isProcessing = true;
  lastAnalysisTime = now;
  
  try {
    // Convert Float32Array to WAV format for ASR
    const wavBlob = convertToWav(audioData, 16000);
    
    // Create form data for API request
    const formData = new FormData();
    formData.append('audio', wavBlob, 'speech.wav');
    formData.append('confidence_threshold', '0.15'); // Lower threshold to detect more speech
    formData.append('boost_sensitivity', 'true'); // Add parameter to boost sensitivity
    
    // Send to backend API for analysis with shorter timeout for faster response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout
    
    try {
      // Get the API URL from environment variables
      const apiUrl = getApiUrl();
      console.log('Sending analyze request to:', `${apiUrl}/api/analyze`);
      
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle server errors
      if (!response.ok) {
        console.warn('ASR server error:', response.status);
        // Return null instead of dummy data
        return null;
      }
      
      const result = await response.json();
      
      // Check for successful response
      if (result.status !== 'success') {
        // Check for "no speech detected" error specifically
        if (result.message && result.message.includes("No clear speech detected")) {
          console.info('No clear speech detected');
          return null;
        }
        throw new Error('ASR analysis failed: ' + (result.message || 'Unknown error'));
      }
      
      // Extract speech characteristics with stricter validation
      const rawCharacteristics = result.speech_characteristics || {};
      
      // Validate received categories against our defined constants
      const speechCharacteristics = {
        fluency: validateCategory(
          rawCharacteristics.fluency, 
          FLUENCY_CATEGORIES, 
          "Medium Fluency", 
          0.6
        ),
        tempo: validateCategory(
          rawCharacteristics.tempo, 
          TEMPO_CATEGORIES, 
          "Medium Tempo", 
          0.6
        ),
        pronunciation: validateCategory(
          rawCharacteristics.pronunciation, 
          PRONUNCIATION_CATEGORIES, 
          "Clear Pronunciation", 
          0.6
        )
      };
      
      // Calculate speech rate (words per minute) with validation
      let speechRate = typeof result.speech_rate === 'number' ? result.speech_rate : 0;
      
      // Apply reasonable bounds to speech rate
      if (speechRate < 60) speechRate = 60;  // Minimum reasonable speech rate
      if (speechRate > 200) speechRate = 200; // Maximum reasonable speech rate
      
      // If no valid speech rate received, derive from tempo category
      if (speechRate === 0) {
        // Derive speech rate from tempo category
        if (speechCharacteristics.tempo.category === "Fast Tempo") {
          speechRate = 150;
        } else if (speechCharacteristics.tempo.category === "Slow Tempo") {
          speechRate = 90;
        } else {
          speechRate = 120; // Medium tempo
        }
      }
      
      // Round to nearest integer
      speechRate = Math.round(speechRate);
      
      // Add to metrics history
      const metrics: SpeechMetrics = {
        timestamp: new Date(),
        fluency: speechCharacteristics.fluency.category,
        fluencyConfidence: speechCharacteristics.fluency.confidence,
        tempo: speechCharacteristics.tempo.category,
        tempoConfidence: speechCharacteristics.tempo.confidence,
        pronunciation: speechCharacteristics.pronunciation.category,
        pronunciationConfidence: speechCharacteristics.pronunciation.confidence,
        speechRate: speechRate
      };
      
      metricsHistory.push(metrics);
      
      // Limit history size
      if (metricsHistory.length > MAX_HISTORY_LENGTH) {
        metricsHistory.shift();
      }
      
      // Return the analysis result
      return {
        fluency: speechCharacteristics.fluency,
        tempo: speechCharacteristics.tempo,
        pronunciation: speechCharacteristics.pronunciation,
        speechRate: speechRate
      };
    } catch (fetchError) {
      // Clear timeout if fetch errors out
      clearTimeout(timeoutId);
      
      // Handle abort errors gracefully
      if (typeof fetchError === 'object' && fetchError !== null && 'name' in fetchError && fetchError.name === 'AbortError') {
        console.info('ASR request timed out, skipping analysis');
        return null;
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('Error in ASR analysis:', error);
    
    // Handle AbortError specifically to avoid showing error in console
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
      console.info('ASR analysis aborted - ignoring');
      return null;
    }
    
    // Return null instead of dummy data
    return null;
  } finally {
    isProcessing = false;
    
    // Process next item in queue if available
    if (processingQueue.length > 0) {
      const nextData = processingQueue.shift();
      if (nextData) {
        // Process next item asynchronously with shorter delay
        setTimeout(() => analyzeSpeech(nextData), 50);
      }
    }
  }
};

/**
 * Validate a speech category against allowed values
 */
const validateCategory = (
  categoryData: any, 
  allowedCategories: string[], 
  defaultCategory: string,
  defaultConfidence: number
): { category: string; confidence: number } => {
  // If no data provided, return default
  if (!categoryData || typeof categoryData !== 'object') {
    return { category: defaultCategory, confidence: defaultConfidence };
  }
  
  // Extract category and confidence
  let category = categoryData.category;
  let confidence = categoryData.confidence;
  
  // Validate category
  if (!category || typeof category !== 'string' || !allowedCategories.includes(category)) {
    category = defaultCategory;
  }
  
  // Validate confidence
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    confidence = defaultConfidence;
  }
  
  return { category, confidence };
};

/**
 * Get speech metrics history
 */
export const getSpeechMetricsHistory = (): SpeechMetrics[] => {
  return [...metricsHistory];
};

/**
 * Clear speech metrics history
 */
export const clearSpeechMetricsHistory = (): void => {
  metricsHistory = [];
};

/**
 * Get average speech metrics over a given time period
 */
export const getAverageSpeechMetrics = (timeSpanMs: number = 30000): {
  fluency: { category: string; confidence: number };
  tempo: { category: string; confidence: number };
  pronunciation: { category: string; confidence: number };
  speechRate: number;
} | null => {
  // Filter metrics by time period with optimization for small windows
  // For very small windows, we prioritize the most recent data over time filtering
  const now = Date.now();
  const cutoffTime = new Date(now - timeSpanMs);
  
  let recentMetrics;
  if (timeSpanMs <= 5000) {
    // For very small time windows, just use the most recent few entries
    // This ensures we always have data for real-time display
    recentMetrics = metricsHistory.slice(-5); 
  } else {
    // For larger windows, filter by timestamp
    recentMetrics = metricsHistory.filter(m => m.timestamp >= cutoffTime);
  }
  
  if (recentMetrics.length === 0) {
    // Return null instead of default values
    return null;
  }
  
  // Get most recent entry for direct values when available
  const mostRecentMetric = recentMetrics[recentMetrics.length - 1];
  
  // For very small data sets (1-2 entries), just use the most recent value
  if (recentMetrics.length <= 2) {
    return {
      fluency: { 
        category: mostRecentMetric.fluency, 
        confidence: mostRecentMetric.fluencyConfidence 
      },
      tempo: { 
        category: mostRecentMetric.tempo, 
        confidence: mostRecentMetric.tempoConfidence 
      },
      pronunciation: { 
        category: mostRecentMetric.pronunciation, 
        confidence: mostRecentMetric.pronunciationConfidence 
      },
      speechRate: mostRecentMetric.speechRate
    };
  }
  
  // For larger data sets, calculate weighted averages with recent entries weighted more
  // Calculate average speech rate with recency weighting
  let totalWeight = 0;
  let weightedSpeechRateSum = 0;
  
  // Count occurrences with weighting by recency
  const fluencyCounts: Record<string, { count: number, confidence: number }> = {};
  const tempoCounts: Record<string, { count: number, confidence: number }> = {};
  const pronunciationCounts: Record<string, { count: number, confidence: number }> = {};
  
  // Process each metric with recency weighting
  recentMetrics.forEach((m, index) => {
    // More recent entries get higher weight (1.0 to 2.0)
    const recencyWeight = 1 + index / recentMetrics.length;
    totalWeight += recencyWeight;
    
    // Weight speech rate
    weightedSpeechRateSum += m.speechRate * recencyWeight;
    
    // Fluency
    if (!fluencyCounts[m.fluency]) {
      fluencyCounts[m.fluency] = { count: 0, confidence: 0 };
    }
    fluencyCounts[m.fluency].count += recencyWeight;
    fluencyCounts[m.fluency].confidence += m.fluencyConfidence * recencyWeight;
    
    // Tempo
    if (!tempoCounts[m.tempo]) {
      tempoCounts[m.tempo] = { count: 0, confidence: 0 };
    }
    tempoCounts[m.tempo].count += recencyWeight;
    tempoCounts[m.tempo].confidence += m.tempoConfidence * recencyWeight;
    
    // Pronunciation
    if (!pronunciationCounts[m.pronunciation]) {
      pronunciationCounts[m.pronunciation] = { count: 0, confidence: 0 };
    }
    pronunciationCounts[m.pronunciation].count += recencyWeight;
    pronunciationCounts[m.pronunciation].confidence += m.pronunciationConfidence * recencyWeight;
  });
  
  // Calculate weighted average speech rate
  const avgSpeechRate = weightedSpeechRateSum / totalWeight;
  
  // Find top categories with weighting
  const topFluency = Object.entries(fluencyCounts)
    .sort((a, b) => b[1].count - a[1].count)[0];
  
  const topTempo = Object.entries(tempoCounts)
    .sort((a, b) => b[1].count - a[1].count)[0];
  
  const topPronunciation = Object.entries(pronunciationCounts)
    .sort((a, b) => b[1].count - a[1].count)[0];
  
  return {
    fluency: { 
      category: topFluency[0], 
      confidence: topFluency[1].confidence / topFluency[1].count 
    },
    tempo: { 
      category: topTempo[0], 
      confidence: topTempo[1].confidence / topTempo[1].count 
    },
    pronunciation: { 
      category: topPronunciation[0], 
      confidence: topPronunciation[1].confidence / topPronunciation[1].count 
    },
    speechRate: avgSpeechRate
  };
};

/**
 * Get speech tempo metrics for time range
 */
export const getSpeechRateMetrics = (timeSpanMs: number = 60000): {
  averageRate: number;
  minRate: number;
  maxRate: number;
  rateVariability: number;
  samples: { timestamp: Date; value: number }[];
} | null => {
  // Optimize for very small time windows to ensure immediate feedback
  const now = Date.now();
  const cutoffTime = new Date(now - timeSpanMs);
  
  let recentMetrics;
  if (timeSpanMs <= 10000) {
    // For small windows, prioritize most recent data over filtering by time
    // This ensures we always have data for real-time display
    recentMetrics = metricsHistory.slice(-8);
  } else {
    // For larger windows, filter by timestamp
    recentMetrics = metricsHistory.filter(m => m.timestamp >= cutoffTime);
  }
  
  if (recentMetrics.length === 0) {
    // Return null instead of default values
    return null;
  }
  
  // For a single entry, just use that value
  if (recentMetrics.length === 1) {
    const rate = recentMetrics[0].speechRate;
    return {
      averageRate: rate,
      minRate: rate,
      maxRate: rate,
      rateVariability: 0,
      samples: [{ timestamp: recentMetrics[0].timestamp, value: rate }]
    };
  }
  
  // Apply weighted calculation for averaged metrics (recent values count more)
  let totalWeight = 0;
  let weightedSum = 0;
  
  // Extract speech rates with recency weighting
  const rates = recentMetrics.map((m, index) => {
    // More recent entries get higher weight
    const weight = 1 + index / recentMetrics.length;
    totalWeight += weight;
    weightedSum += m.speechRate * weight;
    return m.speechRate;
  });
  
  // Calculate statistics
  const averageRate = weightedSum / totalWeight;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  
  // Calculate variability (weighted standard deviation)
  let weightedVarianceSum = 0;
  recentMetrics.forEach((m, index) => {
    const weight = 1 + index / recentMetrics.length;
    weightedVarianceSum += weight * Math.pow(m.speechRate - averageRate, 2);
  });
  const rateVariability = Math.sqrt(weightedVarianceSum / totalWeight);
  
  // Create samples for visualization
  const samples = recentMetrics.map(m => ({
    timestamp: m.timestamp,
    value: m.speechRate
  }));
  
  return {
    averageRate,
    minRate,
    maxRate,
    rateVariability,
    samples
  };
}; 