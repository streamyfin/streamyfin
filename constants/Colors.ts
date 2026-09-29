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

/** The surfaces of a sheet: its background, a group of rows, their lines. */
export const SheetColors = {
  background: "#171717",
  group: "#212121",
  separator: "#303030",
  secondaryText: "#9ba1a6",
  idle: "#5a5a5a",
} as const;
