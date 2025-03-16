import { storage } from "@/utils/mmkv";
import { useCallback } from "react";

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

  const image2Base64 = useCallback(async (url?: string | null) => {
    if (!url) return null;

    let blob: Blob;
    try {
      // Fetch the data from the URL
      const response = await fetch(url);
      blob = await response.blob();
    } catch (error) {
      console.warn("Error fetching image:", error);
      return null;
    }

    // Create a FileReader instance
    const reader = new FileReader();

    // Convert blob to base64
    return new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          // Extract the base64 string (remove the data URL prefix)
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        } else {
          reject(new Error("Failed to convert image to base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
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
