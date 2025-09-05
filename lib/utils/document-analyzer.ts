/**
 * Document Analysis Utilities
 * Provides comprehensive metadata extraction and content analysis for uploaded documents
 */

export interface DocumentAnalysisResult {
  // Basic content metrics
  contentLength: number;
  wordCount: number;
  characterCount: number;
  lineCount: number;
  paragraphCount: number;
  sentenceCount: number;

  // Document structure
  hasHeadings: boolean;
  headingCount: number;
  headingLevels: number[];
  hasLists: boolean;
  listCount: number;
  hasTables: boolean;
  tableCount: number;
  hasCodeBlocks: boolean;
  codeBlockCount: number;

  // Content analysis
  documentType: string;
  language: string;
  readabilityScore: number;
  averageWordsPerSentence: number;
  averageSyllablesPerWord: number;

  // Entity extraction
  dates: string[];
  emails: string[];
  urls: string[];
  phoneNumbers: string[];
  organizations: string[];
  people: string[];
  locations: string[];

  // Topics and keywords
  topics: string[];
  keywords: string[];
  keyPhrases: string[];

  // File-specific metadata
  estimatedPages: number;
  hasImages: boolean;
  imageCount: number;
  hasFootnotes: boolean;
  footnoteCount: number;

  // OCR-specific metadata (for PDFs)
  ocrMetadata?: {
    model: string;
    pagesProcessed: number;
    docSizeBytes: number;
    averageDpi: number;
    pageDimensions: Array<{ width: number; height: number; dpi: number }>;
    processingTime?: number;
  };
}

/**
 * Analyzes document content and extracts comprehensive metadata
 */
export function analyzeDocumentContent(
  content: string,
  fileName: string,
  fileType: string,
  ocrResponse?: any,
): DocumentAnalysisResult {
  const lines = content.split('\n');
  const paragraphs = content
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Basic metrics
  const contentLength = content.length;
  const wordCount = content
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  const characterCount = content.replace(/\s/g, '').length;
  const lineCount = lines.length;
  const paragraphCount = paragraphs.length;
  const sentenceCount = sentences.length;

  // Document structure analysis
  const headingRegex = /^(#{1,6}\s+.+|^[A-Z][A-Z\s]+$)/gm;
  const headings = content.match(headingRegex) || [];
  const hasHeadings = headings.length > 0;
  const headingCount = headings.length;
  const headingLevels = headings
    .map((h) => {
      const match = h.match(/^(#{1,6})/);
      return match ? match[1].length : 0;
    })
    .filter((level) => level > 0);

  const listRegex = /^[\s]*[-*+]\s+|^[\s]*\d+\.\s+/gm;
  const lists = content.match(listRegex) || [];
  const hasLists = lists.length > 0;
  const listCount = lists.length;

  const tableRegex = /\|.*\|/g;
  const tables = content.match(tableRegex) || [];
  const hasTables = tables.length > 0;
  const tableCount = Math.ceil(tables.length / 3); // Rough estimate

  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
  const codeBlocks = content.match(codeBlockRegex) || [];
  const hasCodeBlocks = codeBlocks.length > 0;
  const codeBlockCount = codeBlocks.length;

  // Content analysis
  const documentType = determineDocumentType(content, fileName, fileType);
  const language = detectLanguage(content);
  const readabilityScore = calculateReadabilityScore(content);
  const averageWordsPerSentence =
    sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const averageSyllablesPerWord = calculateAverageSyllables(content);

  // Entity extraction
  const dates = extractDates(content);
  const emails = extractEmails(content);
  const urls = extractUrls(content);
  const phoneNumbers = extractPhoneNumbers(content);
  const organizations = extractOrganizations(content);
  const people = extractPeople(content);
  const locations = extractLocations(content);

  // Topics and keywords
  const topics = extractTopics(content);
  const keywords = extractKeywords(content);
  const keyPhrases = extractKeyPhrases(content);

  // File-specific metadata
  const estimatedPages = Math.ceil(contentLength / 2000); // Rough estimate
  const hasImages = /!\[.*?\]\(.*?\)|<img|<image/i.test(content);
  const imageCount = (content.match(/!\[.*?\]\(.*?\)|<img|<image/gi) || [])
    .length;
  const hasFootnotes = /\[\^\d+\]|\[\d+\]/g.test(content);
  const footnoteCount = (content.match(/\[\^\d+\]|\[\d+\]/g) || []).length;

  // OCR metadata extraction
  let ocrMetadata;
  if (ocrResponse) {
    ocrMetadata = extractOCRMetadata(ocrResponse);
  }

  return {
    contentLength,
    wordCount,
    characterCount,
    lineCount,
    paragraphCount,
    sentenceCount,
    hasHeadings,
    headingCount,
    headingLevels,
    hasLists,
    listCount,
    hasTables,
    tableCount,
    hasCodeBlocks,
    codeBlockCount,
    documentType,
    language,
    readabilityScore,
    averageWordsPerSentence,
    averageSyllablesPerWord,
    dates,
    emails,
    urls,
    phoneNumbers,
    organizations,
    people,
    locations,
    topics,
    keywords,
    keyPhrases,
    estimatedPages,
    hasImages,
    imageCount,
    hasFootnotes,
    footnoteCount,
    ocrMetadata,
  };
}

/**
 * Determines the document type based on content and filename
 */
function determineDocumentType(
  content: string,
  fileName: string,
  fileType: string,
): string {
  const lowerContent = content.toLowerCase();
  const lowerFileName = fileName.toLowerCase();

  // Legal documents
  if (
    lowerContent.includes('agreement') ||
    lowerContent.includes('contract') ||
    lowerContent.includes('terms and conditions') ||
    lowerContent.includes('license')
  ) {
    return 'legal_document';
  }

  // Technical documentation
  if (
    lowerContent.includes('api') ||
    lowerContent.includes('function') ||
    lowerContent.includes('code') ||
    lowerContent.includes('programming')
  ) {
    return 'technical_documentation';
  }

  // Financial documents
  if (
    lowerContent.includes('financial') ||
    lowerContent.includes('revenue') ||
    lowerContent.includes('profit') ||
    lowerContent.includes('budget')
  ) {
    return 'financial_document';
  }

  // Academic papers
  if (
    lowerContent.includes('abstract') ||
    lowerContent.includes('references') ||
    lowerContent.includes('bibliography') ||
    lowerContent.includes('research')
  ) {
    return 'academic_paper';
  }

  // Reports
  if (
    lowerContent.includes('report') ||
    lowerContent.includes('analysis') ||
    lowerContent.includes('summary') ||
    lowerContent.includes('findings')
  ) {
    return 'report';
  }

  // Email
  if (
    lowerContent.includes('from:') ||
    lowerContent.includes('to:') ||
    lowerContent.includes('subject:') ||
    lowerContent.includes('sent:')
  ) {
    return 'email';
  }

  // Configuration files
  if (
    lowerFileName.endsWith('.json') ||
    lowerFileName.endsWith('.yaml') ||
    lowerFileName.endsWith('.yml') ||
    lowerFileName.endsWith('.config')
  ) {
    return 'configuration_file';
  }

  // Code files
  if (lowerFileName.match(/\.(js|ts|py|java|cpp|c|cs|php|rb|go|rs)$/)) {
    return 'source_code';
  }

  // Markdown
  if (lowerFileName.endsWith('.md') || lowerFileName.endsWith('.markdown')) {
    return 'markdown_document';
  }

  return 'text_document';
}

/**
 * Detects the primary language of the document
 */
function detectLanguage(content: string): string {
  // Simple language detection based on common words
  const englishWords = [
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
  ];
  const spanishWords = [
    'el',
    'la',
    'de',
    'que',
    'y',
    'a',
    'en',
    'un',
    'es',
    'se',
    'no',
    'te',
  ];
  const frenchWords = [
    'le',
    'de',
    'et',
    'à',
    'un',
    'il',
    'être',
    'et',
    'en',
    'avoir',
    'que',
    'pour',
  ];

  const lowerContent = content.toLowerCase();
  const words = lowerContent.split(/\s+/);

  const englishCount = words.filter((word) =>
    englishWords.includes(word),
  ).length;
  const spanishCount = words.filter((word) =>
    spanishWords.includes(word),
  ).length;
  const frenchCount = words.filter((word) => frenchWords.includes(word)).length;

  if (englishCount > spanishCount && englishCount > frenchCount) return 'en';
  if (spanishCount > englishCount && spanishCount > frenchCount) return 'es';
  if (frenchCount > englishCount && frenchCount > spanishCount) return 'fr';

  return 'en'; // Default to English
}

/**
 * Calculates a simple readability score (Flesch Reading Ease approximation)
 */
function calculateReadabilityScore(content: string): number {
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = content.split(/\s+/).filter((word) => word.length > 0);
  const syllables = words.reduce(
    (total, word) => total + countSyllables(word),
    0,
  );

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;

  // Simplified Flesch Reading Ease formula
  const score =
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  return Math.max(0, Math.min(100, score));
}

/**
 * Counts syllables in a word (approximation)
 */
function countSyllables(word: string): number {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleanWord.length === 0) return 0;

  const vowels = 'aeiouy';
  let syllableCount = 0;
  let previousWasVowel = false;

  for (let i = 0; i < cleanWord.length; i++) {
    const isVowel = vowels.includes(cleanWord[i]);
    if (isVowel && !previousWasVowel) {
      syllableCount++;
    }
    previousWasVowel = isVowel;
  }

  // Handle silent 'e'
  if (cleanWord.endsWith('e') && syllableCount > 1) {
    syllableCount--;
  }

  return Math.max(1, syllableCount);
}

/**
 * Calculates average syllables per word
 */
function calculateAverageSyllables(content: string): number {
  const words = content.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return 0;

  const totalSyllables = words.reduce(
    (total, word) => total + countSyllables(word),
    0,
  );
  return totalSyllables / words.length;
}

/**
 * Extracts dates from content
 */
function extractDates(content: string): string[] {
  const datePatterns = [
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, // MM/DD/YYYY
    /\b\d{1,2}-\d{1,2}-\d{4}\b/g, // MM-DD-YYYY
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g, // YYYY-MM-DD
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
  ];

  const dates: string[] = [];
  datePatterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) {
      dates.push(...matches);
    }
  });

  return [...new Set(dates)]; // Remove duplicates
}

/**
 * Extracts email addresses from content
 */
function extractEmails(content: string): string[] {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = content.match(emailPattern);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extracts URLs from content
 */
function extractUrls(content: string): string[] {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const matches = content.match(urlPattern);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extracts phone numbers from content
 */
function extractPhoneNumbers(content: string): string[] {
  const phonePatterns = [
    /\b\d{3}-\d{3}-\d{4}\b/g, // XXX-XXX-XXXX
    /\b\(\d{3}\)\s*\d{3}-\d{4}\b/g, // (XXX) XXX-XXXX
    /\b\d{3}\.\d{3}\.\d{4}\b/g, // XXX.XXX.XXXX
    /\b\d{10}\b/g, // XXXXXXXXXX
  ];

  const phoneNumbers: string[] = [];
  phonePatterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) {
      phoneNumbers.push(...matches);
    }
  });

  return [...new Set(phoneNumbers)];
}

/**
 * Extracts organization names from content (simple heuristic)
 */
function extractOrganizations(content: string): string[] {
  const orgPatterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|Corp|Corporation|LLC|Ltd|Limited|Company|Co|Group|Systems|Technologies|Solutions|Services|Associates|Partners))\b/g,
    /\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/g, // Acronyms
  ];

  const organizations: string[] = [];
  orgPatterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) {
      organizations.push(...matches.filter((org) => org.length > 2));
    }
  });

  return [...new Set(organizations)];
}

/**
 * Extracts person names from content (simple heuristic)
 */
function extractPeople(content: string): string[] {
  const namePattern = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
  const matches = content.match(namePattern);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extracts location names from content (simple heuristic)
 */
function extractLocations(content: string): string[] {
  const locationPatterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+)\b/g, // City, State
    /\b(?:New York|Los Angeles|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|San Jose|Austin|Jacksonville|Fort Worth|Columbus|Charlotte|San Francisco|Indianapolis|Seattle|Denver|Washington|Boston|El Paso|Nashville|Detroit|Oklahoma City|Portland|Las Vegas|Memphis|Louisville|Baltimore|Milwaukee|Albuquerque|Tucson|Fresno|Sacramento|Mesa|Kansas City|Atlanta|Long Beach|Colorado Springs|Raleigh|Miami|Virginia Beach|Omaha|Oakland|Minneapolis|Tulsa|Arlington|Tampa|New Orleans|Wichita|Cleveland|Bakersfield|Aurora|Anaheim|Honolulu|Santa Ana|Corpus Christi|Riverside|Lexington|Stockton|Henderson|Saint Paul|St. Louis|Milwaukee|Baltimore|Buffalo|Reno|Fremont|Spokane|Yonkers|Glendale|Huntington Beach|Montgomery|Amarillo|Little Rock|Akron|Shreveport|Augusta|Grand Rapids|Mobile|Des Moines|Richmond|Yonkers|Spokane|Glendale|Huntington Beach|Montgomery|Amarillo|Little Rock|Akron|Shreveport|Augusta|Grand Rapids|Mobile|Des Moines|Richmond)\b/g,
  ];

  const locations: string[] = [];
  locationPatterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) {
      locations.push(...matches);
    }
  });

  return [...new Set(locations)];
}

/**
 * Extracts topics from content (simple keyword-based approach)
 */
function extractTopics(content: string): string[] {
  const topicKeywords = {
    technology: [
      'software',
      'hardware',
      'computer',
      'digital',
      'internet',
      'web',
      'app',
      'system',
      'data',
      'algorithm',
    ],
    business: [
      'company',
      'business',
      'market',
      'sales',
      'revenue',
      'profit',
      'customer',
      'client',
      'service',
      'product',
    ],
    finance: [
      'money',
      'financial',
      'budget',
      'investment',
      'bank',
      'credit',
      'loan',
      'payment',
      'cost',
      'price',
    ],
    legal: [
      'law',
      'legal',
      'contract',
      'agreement',
      'court',
      'judge',
      'lawyer',
      'attorney',
      'rights',
      'liability',
    ],
    health: [
      'health',
      'medical',
      'doctor',
      'patient',
      'treatment',
      'medicine',
      'hospital',
      'disease',
      'therapy',
      'care',
    ],
    education: [
      'school',
      'university',
      'student',
      'teacher',
      'education',
      'learning',
      'course',
      'degree',
      'research',
      'study',
    ],
    science: [
      'research',
      'study',
      'experiment',
      'theory',
      'hypothesis',
      'analysis',
      'data',
      'results',
      'conclusion',
      'method',
    ],
    politics: [
      'government',
      'political',
      'policy',
      'election',
      'vote',
      'democracy',
      'republican',
      'democrat',
      'congress',
      'senate',
    ],
  };

  const lowerContent = content.toLowerCase();
  const topics: string[] = [];

  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    const keywordCount = keywords.filter((keyword) =>
      lowerContent.includes(keyword),
    ).length;
    if (keywordCount >= 2) {
      // Require at least 2 keywords to classify as topic
      topics.push(topic);
    }
  });

  return topics;
}

/**
 * Extracts keywords from content (most frequent meaningful words)
 */
function extractKeywords(content: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'me',
    'him',
    'her',
    'us',
    'them',
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));

  const wordCounts: { [key: string]: number } = {};
  words.forEach((word) => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });

  return Object.entries(wordCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20) // Top 20 keywords
    .map(([word]) => word);
}

/**
 * Extracts key phrases from content (common 2-3 word phrases)
 */
function extractKeyPhrases(content: string): string[] {
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const phrases: { [key: string]: number } = {};

  // Extract 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    phrases[phrase] = (phrases[phrase] || 0) + 1;
  }

  // Extract 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    phrases[phrase] = (phrases[phrase] || 0) + 1;
  }

  return Object.entries(phrases)
    .filter(([, count]) => count >= 2) // Only phrases that appear at least twice
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15) // Top 15 phrases
    .map(([phrase]) => phrase);
}

/**
 * Extracts OCR-specific metadata from Mistral OCR response
 */
function extractOCRMetadata(
  ocrResponse: any,
): DocumentAnalysisResult['ocrMetadata'] {
  if (!ocrResponse) return undefined;

  // Handle both direct OCR response and PDF result structure
  let pages: any[] = [];
  let usageInfo: any = {};
  let model = 'unknown';

  if (ocrResponse.pages) {
    // Direct OCR response structure
    pages = ocrResponse.pages;
    usageInfo = ocrResponse.usageInfo || {};
    model = ocrResponse.model || 'unknown';
  } else if (ocrResponse.images && Array.isArray(ocrResponse.images)) {
    // PDF result structure - we don't have page info in this case
    return {
      model: 'mistral-ocr-latest',
      pagesProcessed: 1,
      docSizeBytes: 0,
      averageDpi: 200,
      pageDimensions: [],
    };
  }

  let totalDpi = 0;
  const pageDimensions: Array<{ width: number; height: number; dpi: number }> =
    [];

  pages.forEach((page: any) => {
    if (page.dimensions) {
      const dpi = page.dimensions.dpi || 200;
      totalDpi += dpi;
      pageDimensions.push({
        width: page.dimensions.width || 0,
        height: page.dimensions.height || 0,
        dpi: dpi,
      });
    }
  });

  const averageDpi = pages.length > 0 ? totalDpi / pages.length : 200;

  return {
    model,
    pagesProcessed: usageInfo.pagesProcessed || pages.length,
    docSizeBytes: usageInfo.docSizeBytes || 0,
    averageDpi,
    pageDimensions,
  };
}
