import { MediaStatus } from "./types";

/** The colours of a status badge, one per tone (SeerrStatusBadgeColors). */
export type SeerrStatusTone =
  | "pending"
  | "processing"
  | "partial"
  | "available"
  | "blocklisted"
  | "request";

/** An icon of MaterialCommunityIcons, the set Seerr's badges map onto. */
export type SeerrStatusIconName =
  | "bell"
  | "clock"
  | "minus"
  | "check"
  | "eye-off"
  | "plus";

const BADGES: Partial<
  Record<MediaStatus, { icon: SeerrStatusIconName; tone: SeerrStatusTone }>
> = {
  [MediaStatus.PENDING]: { icon: "bell", tone: "pending" },
  [MediaStatus.PROCESSING]: { icon: "clock", tone: "processing" },
  [MediaStatus.PARTIALLY_AVAILABLE]: { icon: "minus", tone: "partial" },
  [MediaStatus.AVAILABLE]: { icon: "check", tone: "available" },
  [MediaStatus.BLOCKLISTED]: { icon: "eye-off", tone: "blocklisted" },
};

/**
 * The badge over a title for where it stands, as Seerr draws it
 * (StatusBadgeMini): its icon and tone, the phone and the TV alike. A title
 * Seerr holds nothing for gets a "+" when the user may request it, and no
 * badge otherwise.
 */
export const seerrStatusBadge = (
  status: MediaStatus | undefined,
  canRequest: boolean,
): { icon: SeerrStatusIconName; tone: SeerrStatusTone } | undefined => {
  const badge = status === undefined ? undefined : BADGES[status];
  if (badge) return badge;
  return canRequest ? { icon: "plus", tone: "request" } : undefined;
};
