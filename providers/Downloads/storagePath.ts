import * as FileSystemLegacy from "expo-file-system/legacy";
import { Platform } from "react-native";

// SAF APIs are only available through the legacy expo-file-system API
const { StorageAccessFramework } = FileSystemLegacy;

/**
 * Check if a URI is a SAF (Storage Access Framework) content URI.
 */
export function isSafUri(uri: string): boolean {
  return uri.startsWith("content://");
}

/**
 * Request directory permissions via Android SAF.
 * Opens the system folder picker and returns the selected directory info.
 * Returns null if the user cancelled or on non-Android platforms.
 */
export async function requestDownloadDirectory(): Promise<{
  uri: string;
  name: string;
} | null> {
  if (Platform.OS !== "android") {
    return null;
  }

  const permissions =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();

  if (!permissions.granted) {
    return null;
  }

  const uri = permissions.directoryUri;

  // Extract a human-readable name from the SAF URI
  // e.g. content://...tree/primary%3AMovies → Movies
  const decoded = decodeURIComponent(uri);
  const name =
    decoded.split("%3A").pop()?.split("/").pop() ||
    decoded.split("/").pop() ||
    "Selected Folder";

  return { uri, name };
}

/**
 * Verify that we still have access to a SAF directory.
 * Returns true if we can read the directory, false otherwise.
 */
export async function verifySafAccess(uri: string): Promise<boolean> {
  try {
    await StorageAccessFramework.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy a file to a SAF directory.
 *
 * Creates a new file in the SAF directory and copies the content from the source.
 * Uses the SAF createFileAsync + writeAsStringAsync pattern for Android compatibility.
 *
 * For large video files, this streams via the native SAF implementation.
 *
 * @param sourceFileUri - file:// URI of the source file
 * @param safDirectoryUri - SAF content:// URI of the target directory
 * @param filename - The destination filename (e.g. "show_s01e01.mp4")
 * @param mimeType - MIME type of the file (default: "video/mp4")
 * @returns The SAF URI of the created file, or null on failure
 */
export async function copyFileToSaf(
  sourceFileUri: string,
  safDirectoryUri: string,
  filename: string,
  mimeType = "video/mp4",
): Promise<string | null> {
  try {
    // Create a new empty file in the SAF directory
    const safFileUri = await StorageAccessFramework.createFileAsync(
      safDirectoryUri,
      filename,
      mimeType,
    );

    // Use copyAsync to copy content — this operates at the native level
    // and should handle large files efficiently without loading into JS memory
    await FileSystemLegacy.copyAsync({
      from: sourceFileUri,
      to: safFileUri,
    });

    console.log(`[SAF] Copied ${filename} to SAF: ${safFileUri}`);
    return safFileUri;
  } catch (error) {
    console.error(`[SAF] Failed to copy ${filename} to SAF:`, error);
    return null;
  }
}

/**
 * Delete a file from SAF storage.
 */
export async function deleteSafFile(safUri: string): Promise<void> {
  try {
    await FileSystemLegacy.deleteAsync(safUri, { idempotent: true });
    console.log(`[SAF] Deleted: ${safUri}`);
  } catch (error) {
    console.error("[SAF] Failed to delete file:", error);
  }
}

/**
 * Get the display string for the download location.
 */
export function getDownloadLocationDisplay(
  downloadPath: { uri: string; name: string } | null | undefined,
  defaultLabel: string,
): string {
  if (!downloadPath) {
    return defaultLabel;
  }
  return downloadPath.name;
}
