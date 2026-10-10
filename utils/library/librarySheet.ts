import type { TVLibrarySheetOption } from "@/utils/atoms/tvLibrarySheet";

/** Where a TV library sheet stands on screen. */
export type TVLibrarySheetPlacement = "bottom" | "right";

/**
 * A sheet rises from the bottom on Apple TV and slides in from the right on
 * Android TV, where the platform's own panels do.
 */
export const tvLibrarySheetPlacement = (os: string): TVLibrarySheetPlacement =>
  os === "android" ? "right" : "bottom";

/** The option that stands for "nothing picked" in a filter's list. */
export const ALL_OPTION = "__all__";

/**
 * What a filter is set to, in a few words: nothing, the one pick by name, or
 * how many.
 */
export const filterSummary = (
  options: TVLibrarySheetOption[],
  labels: { all: string; count: (count: number) => string },
): string => {
  const picked = options.filter(
    (option) => option.selected && option.value !== ALL_OPTION,
  );
  if (picked.length === 0) return labels.all;
  if (picked.length === 1) return picked[0].label;
  return labels.count(picked.length);
};
