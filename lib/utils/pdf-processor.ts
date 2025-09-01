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
export async function processPdfWithMistralOCR(
  file: File,
): Promise<ProcessPdfResponse> {
  try {
    // Validate environment variables
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!mistralApiKey) {
      return {
        success: false,
        error: 'MISTRAL_API_KEY environment variable is required',
      };
    }

    // Encode PDF to base64
    const base64Pdf = await encodePdf(file);

    if (!base64Pdf) {
      return {
        success: false,
        error: 'Failed to encode PDF file',
      };
    }

    // Initialize Mistral client
    const client = new Mistral({ apiKey: mistralApiKey });

    // Process PDF with Mistral OCR
    console.log('Processing PDF with Mistral OCR...');
    const ocrResponse = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: `data:application/pdf;base64,${base64Pdf}`,
      },
      includeImageBase64: true,
    });

    console.log('Mistral OCR response received');
    console.log(
      'OCR Response structure:',
      JSON.stringify(ocrResponse, null, 2),
    );

    // Save response to file for debugging (only in development)
    /*
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = require('node:fs');
        const path = require('node:path');
        const debugDir = path.join(process.cwd(), 'debug');
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const debugFile = path.join(debugDir, `ocr-response-${timestamp}.json`);
        fs.writeFileSync(debugFile, JSON.stringify(ocrResponse, null, 2));
        console.log('OCR response saved to:', debugFile);
      } catch (error) {
        console.log(
          'Could not save debug file:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
    */

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

        // According to Mistral AI documentation, the response should have this structure:
        // { pages: [{ text: "...", images: [{ base64: "...", description: "..." }] }] }

        // Pattern 1: Mistral OCR standard structure (pages array)
        if (response.pages && Array.isArray(response.pages)) {
          console.log(
            `Found ${response.pages.length} pages in Mistral OCR response`,
          );
          textContent = response.pages
            .map((page: any, pageIndex: number) => {
              console.log(`Page ${pageIndex} keys:`, Object.keys(page));

              let pageText = '';
              if (page.text && typeof page.text === 'string') {
                pageText = page.text;
              } else if (page.markdown && typeof page.markdown === 'string') {
                pageText = page.markdown;
              } else if (page.content && typeof page.content === 'string') {
                pageText = page.content;
              } else if (
                page.extracted_text &&
                typeof page.extracted_text === 'string'
              ) {
                pageText = page.extracted_text;
              }

              console.log(`Page ${pageIndex} text length:`, pageText.length);
              return pageText;
            })
            .filter(Boolean)
            .join('\n\n');
        }
        // Pattern 2: Direct text property
        else if (response.text && typeof response.text === 'string') {
          textContent = response.text;
        }
        // Pattern 3: Content property
        else if (response.content && typeof response.content === 'string') {
          textContent = response.content;
        }
        // Pattern 4: Result property
        else if (response.result && typeof response.result === 'string') {
          textContent = response.result;
        }
        // Pattern 5: Data with text
        else if (response.data?.text) {
          textContent = response.data.text;
        }
        // Pattern 6: OCR result in nested structure
        else if (response.ocr?.text) {
          textContent = response.ocr.text;
        }
        // Pattern 7: Document text
        else if (response.document_text) {
          textContent = response.document_text;
        }
        // Pattern 8: Try to find any string value in the response
        else {
          const findTextInObject = (obj: any, depth = 0): string => {
            if (depth > 3) return ''; // Prevent infinite recursion

            if (typeof obj === 'string' && obj.trim().length > 10) {
              return obj;
            }

            if (Array.isArray(obj)) {
              return obj
                .map((item) => findTextInObject(item, depth + 1))
                .filter(Boolean)
                .join('\n');
            }

            if (obj && typeof obj === 'object') {
              // Look for promising property names first
              const textKeys = [
                'text',
                'content',
                'result',
                'extracted_text',
                'ocr_text',
                'document_text',
              ];
              for (const key of textKeys) {
                if (
                  key in obj &&
                  typeof obj[key] === 'string' &&
                  obj[key].trim().length > 0
                ) {
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
        console.log('Looking for images in response...');

        // Check for images in various possible locations
        const imageKeys = [
          'images',
          'extracted_images',
          'document_images',
          'image_data',
          'image_base64',
        ];
        for (const key of imageKeys) {
          if (response[key] && Array.isArray(response[key])) {
            console.log(`Found images in '${key}':`, response[key].length);
            response[key].forEach((img: any, index: number) => {
              console.log(`Processing image ${index}:`, Object.keys(img));
              if (
                img &&
                (img.base64 || img.data || img.image_base64 || img.imageBase64)
              ) {
                const base64Data =
                  img.base64 || img.data || img.image_base64 || img.imageBase64;
                const description =
                  img.description ||
                  img.caption ||
                  img.text ||
                  img.alt_text ||
                  img.ocr_text ||
                  img.id ||
                  `Image ${index + 1}`;

                images.push({
                  base64: base64Data,
                  description: description,
                });
                console.log(
                  `Added image ${index} with description: ${description}`,
                );
              }
            });
            break;
          }
        }

        // Also check for images within pages (Mistral OCR standard structure)
        if (response.pages && Array.isArray(response.pages)) {
          console.log('Checking pages for images...');
          response.pages.forEach((page: any, pageIndex: number) => {
            console.log(`Page ${pageIndex} keys:`, Object.keys(page));
            if (page.images && Array.isArray(page.images)) {
              console.log(`Page ${pageIndex} has ${page.images.length} images`);
              page.images.forEach((img: any, imgIndex: number) => {
                console.log(
                  `Page ${pageIndex} Image ${imgIndex} keys:`,
                  Object.keys(img),
                );
                if (
                  img &&
                  (img.base64 ||
                    img.data ||
                    img.image_base64 ||
                    img.imageBase64)
                ) {
                  const base64Data =
                    img.base64 ||
                    img.data ||
                    img.image_base64 ||
                    img.imageBase64;
                  const description =
                    img.description ||
                    img.caption ||
                    img.text ||
                    img.alt_text ||
                    img.ocr_text ||
                    img.id ||
                    `Page ${pageIndex + 1} Image ${imgIndex + 1}`;

                  images.push({
                    base64: base64Data,
                    description: description,
                  });
                  console.log(
                    `Added page ${pageIndex} image ${imgIndex} with description: ${description}`,
                  );
                } else {
                  console.log(
                    `Page ${pageIndex} Image ${imgIndex} missing base64 data. Available fields:`,
                    Object.keys(img),
                  );
                }
              });
            }
          });
        }

        // Check for any base64 data in the response that might be images
        if (images.length === 0) {
          console.log(
            'No images found in standard locations, searching for base64 data...',
          );
          const findBase64InObject = (
            obj: any,
            depth = 0,
          ): Array<{ base64: string; description?: string }> => {
            if (depth > 3) return []; // Prevent infinite recursion

            const found: Array<{ base64: string; description?: string }> = [];

            if (obj && typeof obj === 'object') {
              for (const [key, value] of Object.entries(obj)) {
                if (
                  typeof value === 'string' &&
                  value.length > 100 &&
                  value.startsWith('data:image/')
                ) {
                  // This looks like a base64 image
                  found.push({
                    base64: value,
                    description: `Extracted image from ${key}`,
                  });
                  console.log(`Found base64 image in '${key}'`);
                } else if (typeof value === 'object' && value !== null) {
                  found.push(...findBase64InObject(value, depth + 1));
                }
              }
            }
            return found;
          };

          const foundImages = findBase64InObject(response);
          images.push(...foundImages);
        }

        // Final check - look specifically for Mistral's imageBase64 field
        if (images.length === 0) {
          console.log(
            'Performing final check for Mistral imageBase64 fields...',
          );
          const findMistralImages = (
            obj: any,
            path = 'root',
          ): Array<{ base64: string; description?: string }> => {
            if (path.includes('imageBase64')) return []; // Skip if we're already in an imageBase64 field

            const found: Array<{ base64: string; description?: string }> = [];

            if (obj && typeof obj === 'object') {
              for (const [key, value] of Object.entries(obj)) {
                const currentPath = `${path}.${key}`;

                if (
                  key === 'imageBase64' &&
                  typeof value === 'string' &&
                  value.startsWith('data:image/')
                ) {
                  // Found a Mistral imageBase64 field
                  const parentObj = obj;
                  const description =
                    parentObj.id ||
                    parentObj.description ||
                    `Image from ${path}`;

                  found.push({
                    base64: value,
                    description: description,
                  });
                  console.log(
                    `Found Mistral imageBase64 in '${currentPath}' with description: ${description}`,
                  );
                } else if (typeof value === 'object' && value !== null) {
                  found.push(...findMistralImages(value, currentPath));
                }
              }
            }
            return found;
          };

          const mistralImages = findMistralImages(response);
          images.push(...mistralImages);
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
      console.log(
        'No content extracted. Response structure:',
        JSON.stringify(ocrResponse, null, 2),
      );
      return {
        success: false,
        error:
          'No text content or images extracted from PDF. This might be an empty document or unsupported PDF format.',
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
      const imageDescriptions = images
        .map((img, i) =>
          img.description
            ? `Image ${i + 1}: ${img.description}`
            : `Image ${i + 1}: [No description]`,
        )
        .join('\n');

      finalContent = `PDF document containing ${images.length} image(s):\n${imageDescriptions}`;

      console.log('Generating embedding for image descriptions...');
      embedding = await generateDocumentEmbedding(finalContent);
    }

    console.log(
      `Successfully processed PDF: ${finalContent.length} characters, ${images.length} images`,
    );
    if (images.length > 0) {
      console.log('Extracted images:');
      images.forEach((img, index) => {
        console.log(
          `  Image ${index + 1}: ${img.description} (base64 length: ${img.base64.length})`,
        );
      });
    }

    return {
      success: true,
      content: finalContent,
      images: images.length > 0 ? images : undefined,
      embedding,
    };
  } catch (error) {
    console.error('Error processing PDF with Mistral OCR:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Processes images extracted from PDF and generates embeddings for their descriptions
 */
export async function processExtractedImages(
  images: Array<{ base64: string; description?: string }>,
): Promise<
  Array<{ base64: string; description?: string; embedding?: number[] }>
> {
  const processedImages = [];

  for (const image of images) {
    let embedding: number[] | undefined;

    if (image.description?.trim()) {
      try {
        // Generate embedding for image description
        embedding = await generateDocumentEmbedding(image.description);
      } catch (error) {
        console.error(
          'Error generating embedding for image description:',
          error,
        );
      }
    }

    processedImages.push({
      ...image,
      embedding,
    });
  }

  return processedImages;
}

/**
 * Validates if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}
