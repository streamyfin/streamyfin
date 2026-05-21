import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Platform } from "react-native";
import { clearTopShelfCache, writeTopShelfCache } from "@/modules";
import {
  buildTVDiscoveryPayload,
  type TVDiscoveryPayload,
} from "@/utils/tvDiscovery/payload";

export function updateTopShelfCache({
  api,
  sections,
}: {
  api: Api | null | undefined;
  sections: Array<{ title: string; items: BaseItemDto[] | undefined }>;
}): void {
  if (Platform.OS !== "ios" || !Platform.isTV) return;

  const payload = buildTVDiscoveryPayload({ api, sections });
  if (!payload) {
    clearTopShelfCacheSafely();
    return;
  }

  writeTopShelfPayload(payload, api?.accessToken || undefined);
}

export function writeTopShelfPayload(
  payload: TVDiscoveryPayload,
  apiKey?: string,
): void {
  if (Platform.OS !== "ios" || !Platform.isTV) return;

  try {
    const didWrite = writeTopShelfCache(JSON.stringify(payload), apiKey);

    if (!didWrite) {
      console.warn("[TopShelf] Native cache writer is unavailable");
    }
  } catch (error) {
    console.warn("[TopShelf] Failed to write cache", error);
  }
}

export function clearTopShelfCacheSafely(): void {
  if (Platform.OS !== "ios" || !Platform.isTV) return;

  try {
    const didClear = clearTopShelfCache();

    if (!didClear) {
      console.warn("[TopShelf] Native cache clearer is unavailable");
    }
  } catch (error) {
    console.warn("[TopShelf] Failed to clear cache", error);
  }
}
