import { ABBREVIATIONS } from './constants.js';

// Auto-break long continuous audio chunks into separate sentences using <br>
export function formatSentences(text) {
    if (!text) return "";
    
    // Clean up weird translation artifacts where titles get periods they shouldn't have
    let cleaned = text.replace(/Tiến sĩ\.\s+/gi, "Tiến sĩ ");
    cleaned = cleaned.replace(/Bác sĩ\.\s+/gi, "Bác sĩ ");
    cleaned = cleaned.replace(/Giáo sư\.\s+/gi, "Giáo sư ");
    cleaned = cleaned.replace(/Thạc sĩ\.\s+/gi, "Thạc sĩ ");
    
    // \p{L} matches any unicode letter. \p{Lu} matches any uppercase unicode letter.
    // This perfectly supports Vietnamese accents natively without a massive character list!
    return cleaned.replace(/([\p{L}]+)?([.!?])\s+(?=\p{Lu})/gu, (match, word, punc) => {
        // Don't break if the word is a known abbreviation (Dr., Mr., etc)
        if (word && ABBREVIATIONS.includes(word.toLowerCase())) {
            return match;
        }
        // Don't break on single initials (e.g. John F. Kennedy)
        if (word && word.length === 1 && punc === '.') {
            return match;
        }
        
        return (word || "") + punc + "<br>";
    });
}

// Normalizes text by removing spaces, punctuation, and lowercasing
export function normalizeText(text) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
