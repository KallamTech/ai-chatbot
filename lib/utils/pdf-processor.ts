import { Mistral } from '@mistralai/mistralai';
import { generateDocumentEmbedding } from '@/lib/utils';

interface ProcessPdfResponse {
  success: boolean;
  content?: string;
  images?: Array<{
    base64: string;
    description?: string;
  }>;
  embedding?: number[];
  error?: string;
}

/**
 * Encodes a PDF file to base64 format
 */
export async function encodePdf(file: File): Promise<string | null> {
  try {
    // Convert File to ArrayBuffer, then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert the buffer to a Base64-encoded string
    const base64Pdf = buffer.toString('base64');
    return base64Pdf;
  } catch (error) {
    console.error(`Error encoding PDF: ${error}`);
    return null;
  }
}

/**
 * Processes a PDF file using Mistral OCR to extract text and images,
 * then generates embeddings using Cohere
 */
export async function processPdfWithMistralOCR(file: File): Promise<ProcessPdfResponse> {
  try {
    // Validate environment variables
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!mistralApiKey) {
      return {
        success: false,
        error: 'MISTRAL_API_KEY environment variable is required'
      };
    }

    // Encode PDF to base64
    const base64Pdf = await encodePdf(file);

    if (!base64Pdf) {
      return {
        success: false,
        error: 'Failed to encode PDF file'
      };
    }

    // Initialize Mistral client
    const client = new Mistral({ apiKey: mistralApiKey });

    // Process PDF with Mistral OCR
    console.log('Processing PDF with Mistral OCR...');
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: "data:application/pdf;base64," + base64Pdf
      },
      includeImageBase64: true
    });

    console.log('Mistral OCR response received');

    // Extract text content from OCR response
    let textContent = '';
    const images: Array<{ base64: string; description?: string }> = [];

    // Handle the Mistral OCR response structure
    if (ocrResponse) {
      // Try different possible response structures
      if (typeof ocrResponse === 'string') {
        textContent = ocrResponse;
      } else if (ocrResponse && typeof ocrResponse === 'object') {
        // Check for common OCR response patterns
        const response = ocrResponse as any;

        // Pattern 1: Direct text property
        if (response.text && typeof response.text === 'string') {
          textContent = response.text;
        }
        // Pattern 2: Content property
        else if (response.content && typeof response.content === 'string') {
          textContent = response.content;
        }
        // Pattern 3: Result property
        else if (response.result && typeof response.result === 'string') {
          textContent = response.result;
        }
        // Pattern 4: Data with text
        else if (response.data && response.data.text) {
          textContent = response.data.text;
        }
        // Pattern 5: OCR result in nested structure
        else if (response.ocr && response.ocr.text) {
          textContent = response.ocr.text;
        }
        // Pattern 6: Document text
        else if (response.document_text) {
          textContent = response.document_text;
        }
        // Pattern 7: Pages array (including Mistral OCR structure)
        else if (response.pages && Array.isArray(response.pages)) {
          textContent = response.pages
            .map((page: any) => {
              if (typeof page === 'string') return page;
              if (page.markdown) return page.markdown; // Mistral OCR returns markdown content
              if (page.text) return page.text;
              if (page.content) return page.content;
              if (page.extracted_text) return page.extracted_text;
              return '';
            })
            .filter(Boolean)
            .join('\n\n');
        }
        // Pattern 8: Try to find any string value in the response
        else {
          const findTextInObject = (obj: any, depth = 0): string => {
            if (depth > 3) return ''; // Prevent infinite recursion

            if (typeof obj === 'string' && obj.trim().length > 10) {
              return obj;
            }

            if (Array.isArray(obj)) {
              return obj.map(item => findTextInObject(item, depth + 1)).filter(Boolean).join('\n');
            }

            if (obj && typeof obj === 'object') {
              // Look for promising property names first
              const textKeys = ['text', 'content', 'result', 'extracted_text', 'ocr_text', 'document_text'];
              for (const key of textKeys) {
                if (key in obj && typeof obj[key] === 'string' && obj[key].trim().length > 0) {
                  return obj[key];
                }
              }

              // Then search all values
              for (const value of Object.values(obj)) {
                const text = findTextInObject(value, depth + 1);
                if (text) return text;
              }
            }
            return '';
          };
          textContent = findTextInObject(response);
        }

        // Extract images if available (including from pages)
        const imageKeys = ['images', 'extracted_images', 'document_images', 'image_data'];
        for (const key of imageKeys) {
          if (response[key] && Array.isArray(response[key])) {
            response[key].forEach((img: any) => {
              if (img && (img.base64 || img.data)) {
                images.push({
                  base64: img.base64 || img.data,
                  description: img.description || img.caption || img.text || img.alt_text
                });
              }
            });
            break;
          }
        }

        // Also check for images within pages
        if (response.pages && Array.isArray(response.pages)) {
          response.pages.forEach((page: any) => {
            if (page.images && Array.isArray(page.images)) {
              page.images.forEach((img: any) => {
                if (img && (img.base64 || img.data)) {
                  images.push({
                    base64: img.base64 || img.data,
                    description: img.description || img.caption || img.text || img.alt_text
                  });
                }
              });
            }
          });
        }
      }
    }

    // Clean up the extracted text
    if (textContent) {
      textContent = textContent
        .replace(/\0/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .trim();
    }

    // Check if we have any content (text or images)
    const hasTextContent = textContent && textContent.trim().length > 0;
    const hasImages = images && images.length > 0;

    if (!hasTextContent && !hasImages) {
      console.log('No content extracted. Response structure:', JSON.stringify(ocrResponse, null, 2));
      return {
        success: false,
        error: 'No text content or images extracted from PDF. This might be an empty document or unsupported PDF format.'
      };
    }

    // Generate embedding for the extracted text using Cohere (only if we have text)
    let embedding: number[] | undefined;
    if (hasTextContent) {
      console.log('Generating embedding for extracted content...');
      embedding = await generateDocumentEmbedding(textContent!);

      if (!embedding) {
        console.warn('Failed to generate embedding for PDF content');
      }
    }

    // If we only have images, create a summary text for embedding
    let finalContent = textContent || '';
    if (!hasTextContent && hasImages) {
      const imageDescriptions = images.map((img, i) =>
        img.description ? `Image ${i + 1}: ${img.description}` : `Image ${i + 1}: [No description]`
      ).join('\n');

      finalContent = `PDF document containing ${images.length} image(s):\n${imageDescriptions}`;

      console.log('Generating embedding for image descriptions...');
      embedding = await generateDocumentEmbedding(finalContent);
    }

    console.log(`Successfully processed PDF: ${finalContent.length} characters, ${images.length} images`);

    return {
      success: true,
      content: finalContent,
      images: images.length > 0 ? images : undefined,
      embedding
    };

  } catch (error) {
    console.error('Error processing PDF with Mistral OCR:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Processes images extracted from PDF and generates embeddings for their descriptions
 */
export async function processExtractedImages(
  images: Array<{ base64: string; description?: string }>
): Promise<Array<{ base64: string; description?: string; embedding?: number[] }>> {
  const processedImages = [];

  for (const image of images) {
    let embedding: number[] | undefined;

    if (image.description && image.description.trim()) {
      try {
        // Generate embedding for image description
        embedding = await generateDocumentEmbedding(image.description);
      } catch (error) {
        console.error('Error generating embedding for image description:', error);
      }
    }

    processedImages.push({
      ...image,
      embedding
    });
  }

  return processedImages;
}

/**
 * Validates if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}