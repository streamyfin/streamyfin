import { File, Paths } from "expo-file-system";
import { useCallback } from "react";
import { storage } from "@/utils/mmkv";

const useImageStorage = () => {
  const saveBase64Image = useCallback(async (base64: string, key: string) => {
    try {
      // Save the base64 string to storage
      storage.set(key, base64);
    } catch (error) {
      console.error("Error saving image:", error);
      throw error;
    }
  }, []);

  /**
   * expo-file-system instead of fetch+Blob+FileReader: the latter silently
   * resolves to an empty payload under RN's New Architecture.
   */
  const image2Base64 = useCallback(async (url?: string | null) => {
    if (!url) return null;

    const tmpFile = new File(
      Paths.cache,
      `img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    );
    try {
      const downloaded = await File.downloadFileAsync(url, tmpFile, {
        idempotent: true,
      });
      return await downloaded.base64();
    } catch (error) {
      console.warn("Error fetching image:", error);
      return null;
    } finally {
      try {
        if (tmpFile.exists) tmpFile.delete();
      } catch {
        // best-effort cleanup
      }
    }
  }, []);

  const saveImage = useCallback(
    async (key?: string | null, imageUrl?: string | null) => {
      if (!imageUrl || !key) {
        console.warn("Invalid image URL or key");
        return;
      }

      try {
        const base64Image = await image2Base64(imageUrl);
        if (!base64Image || base64Image.length === 0) {
          console.warn("Failed to convert image to base64");
          return;
        }
        saveBase64Image(base64Image, key);
      } catch (error) {
        console.warn("Error saving image:", error);
      }
    },
    [],
  );

  const loadImage = useCallback(async (key: string) => {
    try {
      // Retrieve the base64 string from storage
      const base64Image = storage.getString(key);
      if (base64Image !== null) {
        // Set the loaded image state
        return `data:image/jpeg;base64,${base64Image}`;
      }
      return null;
    } catch (error) {
      console.error("Error loading image:", error);
      throw error;
    }
  }, []);

  return { saveImage, loadImage, saveBase64Image, image2Base64 };
};

export default useImageStorage;
