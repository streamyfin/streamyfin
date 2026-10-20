import { AxiosError, type AxiosResponse } from "axios";

/**
 * The items of a Jellyfin query result, read off the response an SDK call
 * resolved with.
 *
 * Jellyfin always sends Items, an empty list included, so a 200 without a
 * list is not its answer: a captive portal or a proxy's sign-in page, which
 * axios hands over as a string, an empty body, or JSON of another shape.
 * Read as the list, such an answer resolves a query with undefined, which
 * React Query rejects ("data is undefined"), and an empty list in its place
 * wipes what a refetch was only meant to refresh.
 *
 * It is thrown instead, as an AxiosError that carries the response: the
 * query fails and keeps the data it had, and the app's reporting describes
 * the answer by its route, content type and body (utils/errors.ts), or leaves
 * it out when it is a page from the user's network (isGatewayPageError).
 */
export const queryResultItems = <T>(
  response: AxiosResponse<{ Items?: T[] | null } | null>,
): T[] => {
  // Read as unknown: the type says what Jellyfin sends, not what came.
  const items: unknown = (response.data as { Items?: unknown } | null)?.Items;
  if (Array.isArray(items)) return items as T[];
  throw new AxiosError(
    "Response has no Items list",
    AxiosError.ERR_BAD_RESPONSE,
    response.config,
    response.request,
    response,
  );
};
