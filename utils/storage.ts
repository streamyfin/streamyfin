import { Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { BackgroundDownloader, type StorageLocation } from "@/modules";

let cachedStorageLocations: StorageLocation[] | null = null;

// Debug mode: Set to true to simulate an SD card for testing in emulator
// This creates a real writable directory that mimics SD card behavior
const DEBUG_SIMULATE_SD_CARD = false;

/**
 * Get all available storage locations (Android only)
 * Returns cached result on subsequent calls
 */
export async function getAvailableStorageLocations(): Promise<
  StorageLocation[]
> {
  if (Platform.OS !== "android") {
    return [];
  }

  if (cachedStorageLocations !== null) {
    return cachedStorageLocations;
  }

  try {
    const locations = await BackgroundDownloader.getAvailableStorageLocations();

    // Debug mode: Add a functional simulated SD card for testing
    if (DEBUG_SIMULATE_SD_CARD && locations.length === 1) {
      // Use a real writable path within the app's document directory
      const sdcardSimDir = new Directory(Paths.document, "sdcard_sim");

      // Create the directory if it doesn't exist
      if (!sdcardSimDir.exists) {
        sdcardSimDir.create({ intermediates: true });
      }

      const mockSdCard: StorageLocation = {
        id: "sdcard_sim",
        path: sdcardSimDir.uri.replace("file://", ""),
        type: "external",
        label: "SD Card (Simulated)",
        totalSpace: 64 * 1024 * 1024 * 1024, // 64 GB
        freeSpace: 32 * 1024 * 1024 * 1024, // 32 GB free
      };
      locations.push(mockSdCard);
      console.log("[DEBUG] Added simulated SD card:", mockSdCard.path);
    }

    cachedStorageLocations = locations;
    return locations;
  } catch (error) {
    console.error("Failed to get storage locations:", error);
    return [];
  }
}

/**
 * Clear the cached storage locations
 * Useful when storage configuration might have changed
 */
export function clearStorageLocationsCache(): void {
  cachedStorageLocations = null;
  console.log("[Storage] Cache cleared");
}

/**
 * Get a simplified label for a storage location ID
 * @param storageId - The storage location ID (e.g., "internal", "sdcard_0")
 * @returns Human-readable label (e.g., "Internal Storage", "SD Card")
 */
export async function getStorageLabel(storageId?: string): Promise<string> {
  if (!storageId || Platform.OS !== "android") {
    return "Internal Storage";
  }

  const locations = await getAvailableStorageLocations();
  const location = locations.find((loc) => loc.id === storageId);

  return location?.label || "Internal Storage";
}

/**
 * Get the filesystem path for a storage location ID
 * @param storageId - The storage location ID (e.g., "internal", "sdcard_0")
 * @returns The filesystem path, or default path if not found
 */
export async function getStoragePath(storageId?: string): Promise<string> {
  if (!storageId || Platform.OS !== "android") {
    return getDefaultStoragePath();
  }

  const locations = await getAvailableStorageLocations();
  const location = locations.find((loc) => loc.id === storageId);

  if (!location) {
    console.warn(`Storage location not found: ${storageId}, using default`);
    return getDefaultStoragePath();
  }

  return location.path;
}

/**
 * Get the default storage path (current behavior using Paths.document)
 * @returns The default storage path
 */
export function getDefaultStoragePath(): string {
  // Paths.document returns a Directory with a URI like "file:///data/user/0/..."
  // We need to extract the actual path
  const uri = Paths.document.uri;
  return uri.replace("file://", "");
}

/**
 * Get a storage location by ID
 * @param storageId - The storage location ID
 * @returns The storage location or undefined if not found
 */
export async function getStorageLocationById(
  storageId?: string,
): Promise<StorageLocation | undefined> {
  if (!storageId || Platform.OS !== "android") {
    return undefined;
  }

  const locations = await getAvailableStorageLocations();
  return locations.find((loc) => loc.id === storageId);
}

/**
 * Convert plain file path to file:// URI
 * Required for expo-file-system File constructor
 * @param path - The file path
 * @returns The file:// URI
 */
export function filePathToUri(path: string): string {
  if (path.startsWith("file://")) {
    return path;
  }
  return `file://${path}`;
}
