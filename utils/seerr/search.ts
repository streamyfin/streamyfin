import { uniqBy } from "lodash";
import { SEERR_SEARCH_PAGES } from "@/constants/Seerr";
import type { SeerrApi } from "@/hooks/useSeerr";

type SearchResult = Awaited<ReturnType<SeerrApi["search"]>>["results"][number];

// What Seerr's own site encodes on top of encodeURIComponent
// (encodeURIExtraParams, in its useDiscover hook).
const EXTRA_ENCODES: [RegExp, string][] = [
  [/\(/g, "%28"],
  [/\)/g, "%29"],
  [/!/g, "%21"],
  [/\*/g, "%2A"],
];

/**
 * A query string written the way Seerr's own site writes it.
 *
 * Seerr's API refuses a query that still holds a reserved character, and
 * axios writes a space as "+", which is one: "castlevania noct" came back
 * 400. A space goes out as %20 here, and the apostrophe as it is, as on
 * Seerr's site.
 */
export const seerrQueryString = (
  params: Record<string, string | number>,
): string =>
  Object.entries(params)
    .map(
      ([key, value]) =>
        `${key}=${EXTRA_ENCODES.reduce(
          (encoded, [reserved, code]) => encoded.replace(reserved, code),
          encodeURIComponent(String(value)),
        )}`,
    )
    .join("&");

/**
 * Seerr's first pages of results for what the user typed, each result once.
 *
 * The text goes out as typed. It used to go through URLSearchParams, which
 * reads its argument as a query string: "dune" went out as "dune=", which
 * moved results around, and a word still being typed found nothing
 * ("noctur": no result, where Seerr's own search finds 488). The pages after
 * the first are only asked for when there are any, as Seerr's site does.
 */
export const searchSeerr = async (
  api: Pick<SeerrApi, "search"> | undefined,
  text: string,
): Promise<SearchResult[]> => {
  if (!api) return [];

  const first = await api.search({ query: text, page: 1 });
  const last = Math.min(SEERR_SEARCH_PAGES, first?.totalPages ?? 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, last - 1) }, (_, index) =>
      api.search({ query: text, page: index + 2 }),
    ),
  );

  return uniqBy(
    [first, ...rest].flatMap((page) => page?.results ?? []),
    "id",
  );
};

/**
 * The page to ask for after `last` in a list Seerr gives a page at a time,
 * none past its last page.
 */
export const nextResultsPage = (
  last: { page: number; totalPages: number } | undefined,
): number | undefined =>
  last && last.page < last.totalPages ? last.page + 1 : undefined;
