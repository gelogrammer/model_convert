/**
 * ASR (Automatic Speech Recognition) service for real-time speech analysis
 * Provides speech rate, fluency, tempo, and pronunciation metrics
 */

import { convertToWav } from './audioService';

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

// Categories for speech characteristics
export const FLUENCY_CATEGORIES = ["High Fluency", "Medium Fluency", "Low Fluency"];
export const TEMPO_CATEGORIES = ["Fast Tempo", "Medium Tempo", "Slow Tempo"];
export const PRONUNCIATION_CATEGORIES = ["Clear Pronunciation", "Unclear Pronunciation"];

// Storage for metrics history
let metricsHistory: SpeechMetrics[] = [];
const MAX_HISTORY_LENGTH = 100;

// Configuration
const ANALYSIS_INTERVAL = 2000; // Analyze every 2 seconds
let lastAnalysisTime = 0;
let isProcessing = false;

/**
 * Analyze speech audio data using backend ASR model
 */
export const analyzeSpeech = async (audioData: Float32Array): Promise<{
  fluency: { category: string; confidence: number };
  tempo: { category: string; confidence: number };
  pronunciation: { category: string; confidence: number };
  speechRate: number;
} | null> => {
  // Throttle analysis to reduce server load
  const now = Date.now();
  if (now - lastAnalysisTime < ANALYSIS_INTERVAL || isProcessing) {
    return null;
  }
  
  // Mark as processing to prevent concurrent requests
  isProcessing = true;
  lastAnalysisTime = now;
  
  try {
    // Convert audio data to WAV format for the backend
    const wavBlob = convertToWav(audioData, 16000);
    
    // Create form data for the request
    const formData = new FormData();
    formData.append('audio', wavBlob, 'speech.wav');
    formData.append('confidence_threshold', '0.3');
    
    // Send to backend for ASR analysis
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Backend ASR analysis failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status !== 'success') {
      throw new Error(result.message || 'ASR analysis failed');
    }
    
    // Extract speech characteristics
    const speechCharacteristics = result.speech_characteristics || {
      fluency: { category: "Medium Fluency", confidence: 0.7 },
      tempo: { category: "Medium Tempo", confidence: 0.7 },
      pronunciation: { category: "Clear Pronunciation", confidence: 0.7 }
    };
    
    // Extract speech rate
    const speechRate = result.speech_rate || 120; // Words per minute
    
    // Store metrics for tracking
    addMetricsToHistory({
      timestamp: new Date(),
      fluency: speechCharacteristics.fluency.category,
      fluencyConfidence: speechCharacteristics.fluency.confidence,
      tempo: speechCharacteristics.tempo.category,
      tempoConfidence: speechCharacteristics.tempo.confidence,
      pronunciation: speechCharacteristics.pronunciation.category,
      pronunciationConfidence: speechCharacteristics.pronunciation.confidence,
      speechRate
    });
    
    return {
      fluency: speechCharacteristics.fluency,
      tempo: speechCharacteristics.tempo,
      pronunciation: speechCharacteristics.pronunciation,
      speechRate
    };
  } catch (error) {
    console.error('Error in ASR analysis:', error);
    return null;
  } finally {
    isProcessing = false;
  }
};

/**
 * Add speech metrics to history for tracking
 */
const addMetricsToHistory = (metrics: SpeechMetrics): void => {
  metricsHistory.push(metrics);
  
  // Limit history length
  if (metricsHistory.length > MAX_HISTORY_LENGTH) {
    metricsHistory.shift();
  }
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
} => {
  // Filter metrics by time period
  const cutoffTime = new Date(Date.now() - timeSpanMs);
  const recentMetrics = metricsHistory.filter(m => m.timestamp >= cutoffTime);
  
  if (recentMetrics.length === 0) {
    return {
      fluency: { category: "Medium Fluency", confidence: 0.7 },
      tempo: { category: "Medium Tempo", confidence: 0.7 },
      pronunciation: { category: "Clear Pronunciation", confidence: 0.7 },
      speechRate: 120
    };
  }
  
  // Calculate average speech rate
  const avgSpeechRate = recentMetrics.reduce((sum, m) => sum + m.speechRate, 0) / recentMetrics.length;
  
  // Count occurrences of each category
  const fluencyCounts: Record<string, { count: number, confidence: number }> = {};
  const tempoCounts: Record<string, { count: number, confidence: number }> = {};
  const pronunciationCounts: Record<string, { count: number, confidence: number }> = {};
  
  recentMetrics.forEach(m => {
    // Fluency
    if (!fluencyCounts[m.fluency]) {
      fluencyCounts[m.fluency] = { count: 0, confidence: 0 };
    }
    fluencyCounts[m.fluency].count++;
    fluencyCounts[m.fluency].confidence += m.fluencyConfidence;
    
    // Tempo
    if (!tempoCounts[m.tempo]) {
      tempoCounts[m.tempo] = { count: 0, confidence: 0 };
    }
    tempoCounts[m.tempo].count++;
    tempoCounts[m.tempo].confidence += m.tempoConfidence;
    
    // Pronunciation
    if (!pronunciationCounts[m.pronunciation]) {
      pronunciationCounts[m.pronunciation] = { count: 0, confidence: 0 };
    }
    pronunciationCounts[m.pronunciation].count++;
    pronunciationCounts[m.pronunciation].confidence += m.pronunciationConfidence;
  });
  
  // Find most common categories
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
} => {
  // Filter metrics by time period
  const cutoffTime = new Date(Date.now() - timeSpanMs);
  const recentMetrics = metricsHistory.filter(m => m.timestamp >= cutoffTime);
  
  if (recentMetrics.length === 0) {
    return {
      averageRate: 120,
      minRate: 120,
      maxRate: 120,
      rateVariability: 0,
      samples: []
    };
  }
  
  // Extract speech rates
  const rates = recentMetrics.map(m => m.speechRate);
  
  // Calculate statistics
  const averageRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  
  // Calculate variability (standard deviation)
  const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - averageRate, 2), 0) / rates.length;
  const rateVariability = Math.sqrt(variance);
  
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