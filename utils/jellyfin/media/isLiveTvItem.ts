/** A channel, or a program of the guide: what plays as live television. */
export const isLiveTvItem = (
  item: { Type?: string | null } | null | undefined,
): boolean => item?.Type === "Program" || item?.Type === "TvChannel";
