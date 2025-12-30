import { storage } from "@/utils/mmkv";

/**
 * Load a stored image from MMKV storage
 * Images are stored as base64 strings with the itemId as the key
 * @param key The item ID (albumId, artistId, or itemId)
 * @returns Data URL for the image, or undefined if not found
 */
export function getStoredImage(key: string | undefined): string | undefined {
  if (!key) return undefined;

  try {
    const base64Image = storage.getString(key);
    if (base64Image) {
      return `data:image/jpeg;base64,${base64Image}`;
    }
    return undefined;
  } catch (error) {
    console.warn(`[StoredImages] Failed to load image for key ${key}:`, error);
    return undefined;
  }
}

/**
 * Check if an image is stored for a given key
 * @param key The item ID to check
 * @returns True if an image is stored
 */
export function hasStoredImage(key: string | undefined): boolean {
  if (!key) return false;
  return storage.contains(key);
}
