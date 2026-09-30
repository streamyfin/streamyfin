/**
 * Whether a cached query holds an answer from Seerr: its key names "seerr",
 * first or after what it is for, such as ["search", "seerr", …].
 */
export const isSeerrQuery = (queryKey: readonly unknown[]): boolean =>
  queryKey.includes("seerr");

/**
 * The cached queries a request, an approval or a decline leaves out of date:
 * the recent requests and each request card, Discover's rows and the Seerr
 * search results whose status icons move, and the title asked for. Discover
 * and the title's page then show the change when the user comes back to them.
 */
export const touchedByRequest =
  (title?: { mediaType: string; mediaId: number }) =>
  (queryKey: readonly unknown[]): boolean => {
    const [scope, kind, mediaType, id] = queryKey;
    if (scope === "search") return kind === "seerr";
    if (scope !== "seerr") return false;
    if (["recent_requests", "requests", "discover"].includes(kind as string))
      return true;
    return (
      kind === "detail" &&
      title !== undefined &&
      mediaType === title.mediaType &&
      id === title.mediaId
    );
  };
