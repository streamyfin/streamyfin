/**
 * Whether a cached query holds an answer from Seerr: its key names "seerr",
 * first or after what it is for, such as ["search", "seerr", …].
 */
export const isSeerrQuery = (queryKey: readonly unknown[]): boolean =>
  queryKey.includes("seerr");

/**
 * The Seerr queries a request, an approval or a decline changes whatever the
 * title: the recent requests and each request card, the quota a request
 * spends, and the pages of posters whose status icons move (Discover's rows,
 * a genre's, a studio's or a network's titles, a person's roles).
 */
const TOUCHED_KINDS = [
  "recent_requests",
  "requests",
  "quota",
  "discover",
  "genre",
  "company",
  "person",
];

/**
 * The cached queries a request, an approval or a decline leaves out of date:
 * those of TOUCHED_KINDS, the Seerr search results and the title asked for.
 * Each page then shows the change when the user comes back to it.
 */
export const touchedByRequest =
  (title?: { mediaType: string; mediaId: number }) =>
  (queryKey: readonly unknown[]): boolean => {
    const [scope, kind, mediaType, id] = queryKey;
    if (scope === "search") return kind === "seerr";
    if (scope !== "seerr") return false;
    if (TOUCHED_KINDS.includes(kind as string)) return true;
    return (
      kind === "detail" &&
      title !== undefined &&
      mediaType === title.mediaType &&
      id === title.mediaId
    );
  };
