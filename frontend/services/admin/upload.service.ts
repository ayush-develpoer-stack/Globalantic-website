import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { upload, type UploadedFile } from '@/lib/api/http';

/** Client-side hint only — the API re-checks type (magic bytes) and size. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Returns a user-facing problem with the chosen file, or null if it looks acceptable. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Choose a PNG, JPEG or WEBP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'The image is larger than 5 MB.';
  return null;
}

const mock = {
  async uploadImage(_file: Blob & { name?: string }): Promise<UploadedFile> {
    // Mock mode has no file storage: be explicit instead of faking a URL.
    throw new ServiceError('Image upload needs the real API (NEXT_PUBLIC_DATA_SOURCE=api). In mock mode, paste an image URL instead.', 501);
  },
};

const api: typeof mock = {
  uploadImage: (file) => upload(file, 'CMS_IMAGE'),
};

export const uploadService = isMockMode ? mock : api;
