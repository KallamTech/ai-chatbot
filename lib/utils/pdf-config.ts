/**
 * Utility functions for PDF processing feature detection and configuration
 */

/**
 * Checks if PDF processing with Mistral OCR is available
 */
export function isPdfProcessingAvailable(): boolean {
  return !!process.env.MISTRAL_API_KEY;
}

/**
 * Gets the configuration status for PDF processing
 */
export function getPdfProcessingConfig() {
  return {
    mistralApiKey: !!process.env.MISTRAL_API_KEY,
    cohereEmbedding: true, // Always available via gateway
    isAvailable: isPdfProcessingAvailable(),
    requiredEnvVars: ['MISTRAL_API_KEY'],
    missingEnvVars: [!process.env.MISTRAL_API_KEY && 'MISTRAL_API_KEY'].filter(
      Boolean,
    ),
  };
}

/**
 * Validates file for PDF processing
 */
export function validatePdfFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (
    file.type !== 'application/pdf' &&
    !file.name.toLowerCase().endsWith('.pdf')
  ) {
    return { valid: false, error: 'File must be a PDF' };
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
}

/**
 * Gets supported file types including PDF if processing is available
 */
export function getSupportedFileTypes(): string[] {
  const baseTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'text/xml',
    'application/xml',
  ];

  if (isPdfProcessingAvailable()) {
    baseTypes.push('application/pdf');
  }

  return baseTypes;
}

/**
 * Gets supported file extensions including PDF if processing is available
 */
export function getSupportedFileExtensions(): string[] {
  const baseExtensions = [
    '.txt',
    '.md',
    '.csv',
    '.json',
    '.html',
    '.css',
    '.js',
    '.xml',
    '.log',
  ];

  if (isPdfProcessingAvailable()) {
    baseExtensions.push('.pdf');
  }

  return baseExtensions;
}
