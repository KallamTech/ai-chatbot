/**
 * Integration Example: PDF Processing in Chat Context
 *
 * This example shows how PDF processing can be integrated into the chat workflow
 * to enhance conversations with document content.
 */

import {
  processPdfWithMistralOCR,
  processExtractedImages,
} from '@/lib/utils/pdf-processor';
import { isPdfProcessingAvailable } from '@/lib/utils/pdf-config';
import { generateDocumentEmbedding } from '@/lib/utils';

interface ChatWithPdfResult {
  success: boolean;
  textContent?: string;
  imageDescriptions?: string[];
  combinedEmbedding?: number[];
  error?: string;
}

/**
 * Processes a PDF for chat integration, combining text and image descriptions
 * into a single searchable document with embeddings
 */
export async function processPdfForChat(
  file: File,
): Promise<ChatWithPdfResult> {
  if (!isPdfProcessingAvailable()) {
    return {
      success: false,
      error:
        'PDF processing is not available. Please configure MISTRAL_API_KEY.',
    };
  }

  try {
    // Process PDF with Mistral OCR
    const ocrResult = await processPdfWithMistralOCR(file);

    if (!ocrResult.success) {
      return {
        success: false,
        error: ocrResult.error,
      };
    }

    let combinedContent = ocrResult.content || '';
    const imageDescriptions: string[] = [];

    // Process extracted images if any
    if (ocrResult.images && ocrResult.images.length > 0) {
      const processedImages = await processExtractedImages(ocrResult.images);

      processedImages.forEach((img, index) => {
        if (img.description) {
          imageDescriptions.push(img.description);
          // Append image descriptions to the main content for unified search
          combinedContent += `\n\n[Image ${index + 1}]: ${img.description}`;
        }
      });
    }

    // Generate a combined embedding for the entire document
    let combinedEmbedding: number[] | undefined;
    if (combinedContent.trim()) {
      combinedEmbedding = await generateDocumentEmbedding(combinedContent);
    }

    return {
      success: true,
      textContent: ocrResult.content,
      imageDescriptions,
      combinedEmbedding,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Example usage in a chat context
 */
export async function handlePdfUploadInChat(file: File, chatId: string) {
  // Process the PDF
  const result = await processPdfForChat(file);

  if (!result.success) {
    throw new Error(result.error || 'Failed to process PDF');
  }

  // Create a chat message with the processed content
  const message = {
    role: 'user' as const,
    parts: [
      {
        type: 'file' as const,
        url: URL.createObjectURL(file), // Temporary URL for display
        name: file.name,
        mediaType: 'application/pdf',
      },
      {
        type: 'text' as const,
        text: `I've uploaded a PDF document: "${file.name}". Here's what I extracted:

📄 **Text Content:**
${result.textContent ? result.textContent.substring(0, 500) + (result.textContent.length > 500 ? '...' : '') : 'No text found'}

${
  result.imageDescriptions && result.imageDescriptions.length > 0
    ? `
🖼️ **Images Found (${result.imageDescriptions.length}):**
${result.imageDescriptions.map((desc, i) => `${i + 1}. ${desc}`).join('\n')}
`
    : ''
}

Please help me understand and work with this document.`,
      },
    ],
  };

  return {
    message,
    hasEmbedding: !!result.combinedEmbedding,
    extractedContent: result.textContent,
    imageCount: result.imageDescriptions?.length || 0,
  };
}

/**
 * Enhanced multimodal input handler that includes PDF processing
 */
export async function enhancedFileHandler(file: File) {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf && isPdfProcessingAvailable()) {
    // Process PDF with OCR
    const result = await processPdfForChat(file);

    return {
      url: URL.createObjectURL(file),
      name: file.name,
      contentType: file.type,
      processingResult: result,
      enhanced: true,
    };
  } else {
    // Standard file handling for non-PDFs or when PDF processing is unavailable
    return {
      url: URL.createObjectURL(file),
      name: file.name,
      contentType: file.type,
      enhanced: false,
    };
  }
}
