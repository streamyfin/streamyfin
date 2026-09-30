export const Colors = {
  primary: "#9334E9",
  primaryRGB: "rgb(147 51 234)",
  primaryLightRGB: "rgb(192 132 252)",
  text: "#ECEDEE",
  background: "#151718",
  tint: "#fff",
  icon: "#9BA1A6",
  tabIconDefault: "#9BA1A6",
  tabIconSelected: "#9333ea",
};

/**
 * What a Seerr status reads as wherever it is spelled out: available in
 * green, pending in amber, requested (approved and on its way) in indigo.
 */
export const SeerrStatusColors = {
  available: "#22c55e",
  pending: "#f59e0b",
  requested: "#818cf8",
} as const;

/** Seerr's badges (its Badge): each tone's fill, edge and text. */
export const SeerrBadgeColors = {
  primary: {
    background: "rgba(99, 102, 241, 0.8)",
    border: "#6366f1",
    text: "#e0e7ff",
  },
  success: {
    background: "rgba(34, 197, 94, 0.8)",
    border: "#22c55e",
    text: "#dcfce7",
  },
  warning: {
    background: "rgba(234, 179, 8, 0.8)",
    border: "#eab308",
    text: "#fef9c3",
  },
  danger: {
    background: "rgba(220, 38, 38, 0.8)",
    border: "#ef4444",
    text: "#fee2e2",
  },
} as const;

/** Seerr's request card: its surface, the fade over its backdrop, its text. */
export const SeerrCardColors = {
  surface: "#374151",
  fadeFrom: "rgba(31, 41, 55, 0.47)",
  fadeTo: "rgba(31, 41, 55, 1)",
  requester: "#d1d5db",
  label: "#9ca3af",
} as const;

/** The report issue button of a Seerr page, Seerr's warning yellow. */
export const SeerrIssueColors = {
  background: "rgba(234, 179, 8, 0.5)",
  border: "#facc15",
} as const;

/** The surfaces of a sheet: its background, a group of rows, their lines. */
export const SheetColors = {
  background: "#171717",
  group: "#212121",
  separator: "#303030",
  secondaryText: "#9ba1a6",
  idle: "#5a5a5a",
} as const;

/** The background of a page drawn under a parallax header (ParallaxPage). */
export const ParallaxPageColors = {
  background: "black",
} as const;
