import type { RemoteSubtitleInfo } from "@jellyfin/sdk/lib/generated-client";
import type { SubtitleSearchResult } from "@/hooks/useRemoteSubtitles";
import type { NativePlayerSubtitleSearchResult } from "@/modules/mpv-player";

/** A result of the server's search, in the shape both search screens use. */
export const jellyfinToResult = (
  sub: RemoteSubtitleInfo,
): SubtitleSearchResult => ({
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
});

/** The rows the native search sheet shows of `results`: only the fields it reads. */
export const mapSearchResults = (
  results: SubtitleSearchResult[],
): NativePlayerSubtitleSearchResult[] =>
  results.map((r) => ({
    id: r.id,
    name: r.name,
    providerName: r.providerName,
    format: r.format,
    language: r.language,
    communityRating: r.communityRating,
    downloadCount: r.downloadCount,
    isHashMatch: r.isHashMatch,
    hearingImpaired: r.hearingImpaired,
    aiTranslated: r.aiTranslated,
  }));
