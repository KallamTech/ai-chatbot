import { put, head, del } from '@vercel/blob';

/**
 * Vercel Blob Storage Utility
 *
 * This module handles storing and retrieving large image data using Vercel Blob storage
 * instead of base64 encoding, which was causing context size issues.
 *
 * Required Environment Variables:
 * - BLOB_READ_WRITE_TOKEN: Your Vercel Blob read/write token
 *
 * Setup:
 * 1. Go to your Vercel project dashboard
 * 2. Navigate to Storage tab and create a new Blob store
 * 3. Copy the BLOB_READ_WRITE_TOKEN to your environment variables
 */

export interface BlobReference {
  url: string;
  mediaType: string;
  size: number;
  uploadedAt: Date;
}

/**
 * Store binary data as a blob and return a reference
 */
export async function storeBlob(
  data: Uint8Array,
  mediaType: string,
): Promise<BlobReference> {
  try {
    // Convert Uint8Array to Buffer for Vercel Blob API
    const buffer = Buffer.from(data);

    const blob = await put(`images/${Date.now()}-${Math.random().toString(36).substring(2)}.${getFileExtension(mediaType)}`, buffer, {
      access: 'public',
      contentType: mediaType,
    });

    return {
      url: blob.url,
      mediaType,
      size: data.length,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error('Failed to store blob:', error);
    throw new Error('Failed to store image blob');
  }
}

/**
 * Get blob metadata without loading the full data
 */
export async function getBlobMetadata(url: string): Promise<BlobReference | null> {
  try {
    const blob = await head(url);

    return {
      url,
      mediaType: blob.contentType || 'image/png',
      size: blob.size || 0,
      uploadedAt: new Date(blob.uploadedAt),
    };
  } catch (error) {
    console.error(`Failed to get blob metadata ${url}:`, error);
    return null;
  }
}

/**
 * Delete a blob from storage
 */
export async function deleteBlob(url: string): Promise<boolean> {
  try {
    await del(url);
    return true;
  } catch (error) {
    console.error(`Failed to delete blob ${url}:`, error);
    return false;
  }
}

/**
 * Helper function to get file extension from media type
 */
function getFileExtension(mediaType: string): string {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };

  return extensions[mediaType] || 'png';
}
