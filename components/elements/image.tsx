import { cn } from '@/lib/utils';
import NextImage from 'next/image';
import type { Experimental_GeneratedImage } from 'ai';

export type ImageProps = (Experimental_GeneratedImage | { blobUrl: string; mediaType: string }) & {
  className?: string;
  alt?: string;
};

export const Image = ({
  base64,
  uint8Array,
  mediaType,
  blobUrl,
  ...props
}: ImageProps & { base64?: string; uint8Array?: Uint8Array; blobUrl?: string }) => {
  // Determine the image source based on available data
  const imageSrc = blobUrl
    ? blobUrl
    : (base64 && mediaType)
    ? `data:${mediaType};base64,${base64}`
    : '';

  return (
    <NextImage
      {...props}
      alt={props.alt || 'Generated image'}
      className={cn(
        'h-auto max-w-full overflow-hidden rounded-md',
        props.className,
      )}
      src={imageSrc}
      width={500}
      height={500}
      style={{ width: 'auto', height: 'auto' }}
    />
  );
};
