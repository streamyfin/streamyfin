/**
 * Whether a cached query holds an answer from Seerr: its key names "seerr",
 * first or after what it is for, such as ["search", "seerr", …].
 */
export const isSeerrQuery = (queryKey: readonly unknown[]): boolean =>
  queryKey.includes("seerr");
