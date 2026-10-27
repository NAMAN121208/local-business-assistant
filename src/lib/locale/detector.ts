// src/lib/locale/detector.ts

export type SupportedLanguage = 'en' | 'hi' | 'kn';
export type ScriptType = 'native' | 'latin';
export type Dialect = 'en' | 'hi' | 'hi_latin' | 'kn' | 'kn_latin';

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  script: ScriptType;
  dialect: Dialect;
  confidence: number;
}

const HINGLISH_KEYWORDS = new Set([
  'aaj', 'kal', 'parso', 'subah', 'dopahar', 'shaam', 'raat',
  'kya', 'hai', 'hain', 'milega', 'milenge', 'dikhana', 'dikha',
  'bukhar', 'bukhaar', 'dawa', 'dawai', 'goli', 'chahiye', 'karna',
  'kitna', 'kitne', 'rupaye', 'kab', 'kahan', 'kripya', 'dhanyavad',
  'namaste', 'batao', 'bataye', 'batayein', 'hoga', 'hogi', 'apna',
  'khula', 'band', 'bandh', 'pehle', 'kardo', 'chahiye',
]);

const KANGLISH_KEYWORDS = new Set([
  'ivattu', 'naale', 'naadadhu', 'beligge', 'sanje', 'madhyahna', 'raatri',
  'beku', 'ideya', 'elli', 'hege', 'jvara', 'oushadha', 'aushadha',
  'maathre', 'dhanyavada', 'namaskara', 'thilisi', 'madalu', 'sigutha',
  'banni', 'agide', 'samaya', 'bidi', 'kodbeku', 'thinnabeku',
]);

/**
 * Detects language, script (native vs romanised), and dialect from customer message
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { language: 'en', script: 'latin', dialect: 'en', confidence: 1.0 };
  }

  // 1. Check Unicode Blocks
  // Devanagari: U+0900 to U+097F
  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  if (hasDevanagari) {
    return {
      language: 'hi',
      script: 'native',
      dialect: 'hi',
      confidence: 0.95,
    };
  }

  // Kannada: U+0C80 to U+0CFF
  const hasKannada = /[\u0C80-\u0CFF]/.test(trimmed);
  if (hasKannada) {
    return {
      language: 'kn',
      script: 'native',
      dialect: 'kn',
      confidence: 0.95,
    };
  }

  // 2. Romanised / Latin Script analysis
  const words = trimmed
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  let hinglishCount = 0;
  let kanglishCount = 0;

  for (const word of words) {
    if (HINGLISH_KEYWORDS.has(word)) hinglishCount++;
    if (KANGLISH_KEYWORDS.has(word)) kanglishCount++;
  }

  const totalWords = Math.max(words.length, 1);

  if (kanglishCount >= 1 && kanglishCount >= hinglishCount) {
    return {
      language: 'kn',
      script: 'latin',
      dialect: 'kn_latin',
      confidence: Math.min(0.5 + kanglishCount / totalWords, 0.95),
    };
  }

  if (hinglishCount >= 1) {
    return {
      language: 'hi',
      script: 'latin',
      dialect: 'hi_latin',
      confidence: Math.min(0.5 + hinglishCount / totalWords, 0.95),
    };
  }

  // Default to English
  return {
    language: 'en',
    script: 'latin',
    dialect: 'en',
    confidence: 0.9,
  };
}
