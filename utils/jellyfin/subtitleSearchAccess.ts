import type { UserDto } from "@jellyfin/sdk/lib/generated-client";

/**
 * Whether Jellyfin lets this user search for and download subtitles through
 * the server: the routes sit behind its SubtitleManagement policy, which an
 * administrator always passes and everyone else only with the "allow subtitle
 * management" permission — off by default.
 *
 * A user whose policy has not loaded is let through: the server has the last
 * word either way.
 */
export const canSearchServerSubtitles = (
  user: UserDto | null | undefined,
): boolean => {
  const policy = user?.Policy;
  if (!policy) return true;
  return (
    policy.IsAdministrator === true || policy.EnableSubtitleManagement === true
  );
};

/**
 * The server would refuse, or did refuse, a subtitle search for this user.
 * Its own class so the screens can say so in the user's language instead of
 * guessing at a missing provider.
 */
export class SubtitleSearchNotAllowedError extends Error {
  constructor() {
    super("Subtitle search is not allowed for this user");
    this.name = "SubtitleSearchNotAllowedError";
  }
}

/**
 * What the search screens show under "Search failed". Without a client-side
 * OpenSubtitles key the only source is the server, and a failure there most
 * likely means it has no subtitle provider.
 */
export const subtitleSearchErrorMessage = (
  error: unknown,
  hasOpenSubtitlesApiKey: boolean,
  t: (key: string) => string,
): string => {
  if (error instanceof SubtitleSearchNotAllowedError) {
    return t("player.subtitle_search_not_allowed");
  }
  if (!hasOpenSubtitlesApiKey) return t("player.no_subtitle_provider");
  return error instanceof Error ? error.message : String(error);
};
