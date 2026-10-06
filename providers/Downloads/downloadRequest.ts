import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Whether a download the user confirmed has to be turned down for want of a
 * media source.
 *
 * A single item downloads the source picked in the sheet, and the server lists
 * none for some items (a missing episode is one). The user gets there by
 * pressing download, so it is theirs to be told about and not an error of the
 * app's to report. Several items each resolve their own default source once
 * the download starts, so nothing is asked of them up front.
 */
export const lacksMediaSource = (
  pendingCount: number,
  mediaSource: MediaSourceInfo | null | undefined,
): boolean => pendingCount === 1 && !mediaSource?.Id;
