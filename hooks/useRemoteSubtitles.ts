import type {
  BaseItemDto,
  RemoteSubtitleInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { getSubtitleApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  addDownloadedSubtitle,
  type DownloadedSubtitle,
} from "@/utils/atoms/downloadedSubtitles";
import { useSettings } from "@/utils/atoms/settings";
import {
  OpenSubtitlesApi,
  type OpenSubtitlesResult,
} from "@/utils/opensubtitles/api";

export interface SubtitleSearchResult {
  id: string;
  name: string;
  providerName: string;
  format: string;
  language: string;
  communityRating?: number;
  downloadCount?: number;
  isHashMatch?: boolean;
  hearingImpaired?: boolean;
  aiTranslated?: boolean;
  machineTranslated?: boolean;
  /** For OpenSubtitles: file ID to download */
  fileId?: number;
  /** Source: 'jellyfin' or 'opensubtitles' */
  source: "jellyfin" | "opensubtitles";
}

interface UseRemoteSubtitlesOptions {
  itemId: string;
  item: BaseItemDto;
  mediaSourceId?: string | null;
}

/**
 * Convert Jellyfin RemoteSubtitleInfo to unified SubtitleSearchResult
 */
function jellyfinToResult(sub: RemoteSubtitleInfo): SubtitleSearchResult {
  return {
    id: sub.Id ?? "",
    name: sub.Name ?? "Unknown",
    providerName: sub.ProviderName ?? "Unknown",
    format: sub.Format ?? "srt",
    language: sub.ThreeLetterISOLanguageName ?? "",
    communityRating: sub.CommunityRating ?? undefined,
    downloadCount: sub.DownloadCount ?? undefined,
    isHashMatch: sub.IsHashMatch ?? undefined,
    hearingImpaired: sub.HearingImpaired ?? undefined,
    aiTranslated: sub.AiTranslated ?? undefined,
    machineTranslated: sub.MachineTranslated ?? undefined,
    source: "jellyfin",
  };
}

/**
 * Convert OpenSubtitles result to unified SubtitleSearchResult
 */
function openSubtitlesToResult(
  sub: OpenSubtitlesResult,
): SubtitleSearchResult | null {
  const firstFile = sub.attributes.files[0];
  if (!firstFile) return null;

  return {
    id: sub.id,
    name:
      sub.attributes.release || sub.attributes.files[0]?.file_name || "Unknown",
    providerName: "OpenSubtitles",
    format: sub.attributes.format || "srt",
    language: sub.attributes.language,
    communityRating: sub.attributes.ratings,
    downloadCount: sub.attributes.download_count,
    isHashMatch: false,
    hearingImpaired: sub.attributes.hearing_impaired,
    aiTranslated: sub.attributes.ai_translated,
    machineTranslated: sub.attributes.machine_translated,
    fileId: firstFile.file_id,
    source: "opensubtitles",
  };
}

/**
 * Hook for searching and downloading remote subtitles
 *
 * Primary: Uses Jellyfin's subtitle API (server-side OpenSubtitles plugin)
 * Fallback: Direct OpenSubtitles API when server has no provider
 */
export function useRemoteSubtitles({
  itemId,
  item,
  mediaSourceId: _mediaSourceId,
}: UseRemoteSubtitlesOptions) {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const openSubtitlesApiKey = settings.openSubtitlesApiKey;

  // Check if we can use OpenSubtitles fallback
  const hasOpenSubtitlesApiKey = Boolean(openSubtitlesApiKey);

  // Create OpenSubtitles API client when API key is available
  const openSubtitlesApi = useMemo(() => {
    if (!openSubtitlesApiKey) return null;
    return new OpenSubtitlesApi(openSubtitlesApiKey);
  }, [openSubtitlesApiKey]);

  /**
   * Search for subtitles via Jellyfin API
   */
  const searchJellyfin = useCallback(
    async (language: string): Promise<SubtitleSearchResult[]> => {
      if (!api) throw new Error("API not available");

      const subtitleApi = getSubtitleApi(api);
      const response = await subtitleApi.searchRemoteSubtitles({
        itemId,
        language,
      });

      return (response.data || []).map(jellyfinToResult);
    },
    [api, itemId],
  );

  /**
   * Search for subtitles via OpenSubtitles direct API
   */
  const searchOpenSubtitles = useCallback(
    async (language: string): Promise<SubtitleSearchResult[]> => {
      if (!openSubtitlesApi) {
        throw new Error("OpenSubtitles API key not configured");
      }

      // Get IMDB ID from item if available
      const imdbId = item.ProviderIds?.Imdb;

      // Build search params
      const params: Parameters<OpenSubtitlesApi["search"]>[0] = {
        languages: language,
      };

      if (imdbId) {
        params.imdbId = imdbId;
      } else {
        // Fall back to title search
        params.query = item.Name || "";
        params.year = item.ProductionYear || undefined;
      }

      // For TV episodes, add season/episode info
      if (item.Type === "Episode") {
        params.seasonNumber = item.ParentIndexNumber || undefined;
        params.episodeNumber = item.IndexNumber || undefined;
      }

      const response = await openSubtitlesApi.search(params);

      return response.data
        .map(openSubtitlesToResult)
        .filter((r): r is SubtitleSearchResult => r !== null);
    },
    [openSubtitlesApi, item],
  );

  /**
   * Download subtitle via Jellyfin API (saves to server library)
   */
  const downloadJellyfin = useCallback(
    async (subtitleId: string): Promise<void> => {
      if (!api) throw new Error("API not available");

      const subtitleApi = getSubtitleApi(api);
      await subtitleApi.downloadRemoteSubtitles({
        itemId,
        subtitleId,
      });
    },
    [api, itemId],
  );

  /**
   * Download subtitle via OpenSubtitles API (returns local file path)
   *
   * On TV: Downloads to cache directory and persists metadata in MMKV
   * On mobile: Downloads to cache directory (ephemeral, no persistence)
   *
   * Uses a flat filename structure with itemId prefix to avoid tvOS permission issues
   */
  const downloadOpenSubtitles = useCallback(
    async (
      fileId: number,
      result: SubtitleSearchResult,
    ): Promise<{ path: string; subtitle?: DownloadedSubtitle }> => {
      if (!openSubtitlesApi) {
        throw new Error("OpenSubtitles API key not configured");
      }

      // Get download link
      const response = await openSubtitlesApi.download(fileId);
      const originalFileName = response.file_name || `subtitle_${fileId}.srt`;

      // Use cache directory for both platforms (tvOS has permission issues with documents)
      // TV: Uses itemId prefix for organization and persists metadata
      // Mobile: Simple filename, no persistence
      const subtitlesDir = new Directory(Paths.cache, "streamyfin-subtitles");

      // Ensure directory exists
      if (!subtitlesDir.exists) {
        subtitlesDir.create();
      }

      // TV: Prefix filename with itemId for organization
      // Mobile: Use original filename
      const fileName = Platform.isTV
        ? `${itemId}_${originalFileName}`
        : originalFileName;

      // Create file and download
      const destination = new File(subtitlesDir, fileName);

      // Delete existing file if it exists (re-download)
      if (destination.exists) {
        destination.delete();
      }

      await File.downloadFileAsync(response.link, destination);

      // TV: Persist metadata for future sessions
      if (Platform.isTV) {
        const subtitleMetadata: DownloadedSubtitle = {
          id: result.id,
          itemId,
          filePath: destination.uri,
          name: result.name,
          language: result.language,
          format: result.format,
          source: "opensubtitles",
          downloadedAt: Date.now(),
        };
        addDownloadedSubtitle(subtitleMetadata);
        return { path: destination.uri, subtitle: subtitleMetadata };
      }

      return { path: destination.uri };
    },
    [openSubtitlesApi, itemId],
  );

  /**
   * Search mutation - tries Jellyfin first, falls back to OpenSubtitles
   */
  const searchMutation = useMutation({
    mutationFn: async ({
      language,
      preferOpenSubtitles = false,
    }: {
      language: string;
      preferOpenSubtitles?: boolean;
    }) => {
      // If user prefers OpenSubtitles and has API key, use it
      if (preferOpenSubtitles && hasOpenSubtitlesApiKey) {
        return searchOpenSubtitles(language);
      }

      // Try Jellyfin first
      try {
        const results = await searchJellyfin(language);
        // If no results and we have OpenSubtitles fallback, try it
        if (results.length === 0 && hasOpenSubtitlesApiKey) {
          return searchOpenSubtitles(language);
        }
        return results;
      } catch (error) {
        // If Jellyfin fails (no provider configured) and we have fallback, use it
        if (hasOpenSubtitlesApiKey) {
          return searchOpenSubtitles(language);
        }
        throw error;
      }
    },
  });

  /**
   * Download mutation
   */
  const downloadMutation = useMutation({
    mutationFn: async (result: SubtitleSearchResult) => {
      if (result.source === "jellyfin") {
        await downloadJellyfin(result.id);
        return { type: "server" as const };
      }
      if (result.fileId) {
        const { path, subtitle } = await downloadOpenSubtitles(
          result.fileId,
          result,
        );
        return { type: "local" as const, path, subtitle };
      }
      throw new Error("Invalid subtitle result");
    },
  });

  return {
    // State
    hasOpenSubtitlesApiKey,
    isSearching: searchMutation.isPending,
    isDownloading: downloadMutation.isPending,
    searchError: searchMutation.error,
    downloadError: downloadMutation.error,
    searchResults: searchMutation.data,

    // Actions
    search: searchMutation.mutate,
    searchAsync: searchMutation.mutateAsync,
    download: downloadMutation.mutate,
    downloadAsync: downloadMutation.mutateAsync,
    reset: () => {
      searchMutation.reset();
      downloadMutation.reset();
    },
  };
}
