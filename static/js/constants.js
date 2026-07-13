// Performance Constraints
export const MAX_HISTORY_NODES = 50; 

// VAD Variables & Thresholds
export const SILENCE_DELAY = 600; // ms (Lowered to catch very short pauses from fast speakers)
export const MAX_CHUNK_TIME = 12000; // 12 seconds limit for excessively long sentences
export const VOLUME_THRESHOLD = 3; 

// Language / NLP Constants
export const ABBREVIATIONS = ['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'ts', 'ths', 'bs', 'gs', 'pgs'];
