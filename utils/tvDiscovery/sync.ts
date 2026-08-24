import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Platform } from "react-native";
import { clearTvRecommendations, syncTvRecommendations } from "@/modules";
import {
  clearTopShelfCacheSafely,
  writeTopShelfPayload,
} from "@/utils/topshelf/cache";
import { buildTVDiscoveryPayload } from "./payload";

export function updateTVDiscovery({
  api,
  sections,
  useEpisodeImages,
}: {
  api: Api | null | undefined;
  sections: Array<{ title: string; items: BaseItemDto[] | undefined }>;
  useEpisodeImages?: boolean;
}): void {
  if (!Platform.isTV) return;

  const payload = buildTVDiscoveryPayload({
    api,
    sections,
    // Google TV forces landscape home tiles; Apple TV renders 2:3 posters.
    imageShape: Platform.OS === "android" ? "landscape" : "poster",
    useEpisodeImages,
  });

  if (!payload) {
    console.log("[TVDiscovery] No payload generated; clearing TV discovery");
    clearTVDiscoverySafely();
    return;
  }

  const sectionSummary = payload.sections
    .map((section) => `${section.title}:${section.items.length}`)
    .join(", ");
  console.log(
    `[TVDiscovery] Sync payload prepared for ${Platform.OS} TV with ${payload.sections.length} section(s): ${sectionSummary}`,
  );

  if (Platform.OS === "ios") {
    writeTopShelfPayload(payload, api?.accessToken || undefined);
    return;
  }

  if (Platform.OS === "android") {
    try {
      const didSync = syncTvRecommendations(JSON.stringify(payload));

      console.log(`[TVDiscovery] Android sync result: ${didSync}`);

      if (!didSync) {
        console.warn(
          "[TVDiscovery] Android recommendations sync is unavailable",
        );
      }
    } catch (error) {
      console.warn(
        "[TVDiscovery] Failed to sync Android recommendations",
        error,
      );
    }
  }
}

export function clearTVDiscoverySafely(): void {
  if (!Platform.isTV) return;

  console.log(`[TVDiscovery] Clearing TV discovery for ${Platform.OS} TV`);

  if (Platform.OS === "ios") {
    clearTopShelfCacheSafely();
    return;
  }

  if (Platform.OS === "android") {
    try {
      const didClear = clearTvRecommendations();

      console.log(`[TVDiscovery] Android clear result: ${didClear}`);

      if (!didClear) {
        console.warn(
          "[TVDiscovery] Android recommendations clearer is unavailable",
        );
      }
    } catch (error) {
      console.warn(
        "[TVDiscovery] Failed to clear Android recommendations",
        error,
      );
    }
  }
}
