import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/utils/atoms/settings";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/** Wikidata property for an IMDb ID — the bridge from a Jellyfin item. */
const P_IMDB_ID = "P345";

/** Awards do not change. Refetching them is pure waste. */
const STALE_TIME_MS = 24 * 60 * 60 * 1000;

/** Wikimedia asks that clients identify themselves. */
const USER_AGENT = "Streamyfin (https://github.com/streamyfin/streamyfin)";

const SEARCH_TIMEOUT_MS = 15000;
/** The awards query walks award statements and is routinely slower. */
const SPARQL_TIMEOUT_MS = 30000;

const DEFAULT_RETRY_DELAY_MS = 2000;
/** Wikimedia's Retry-After can be generous; do not sit on a query forever. */
const MAX_RETRY_DELAY_MS = 60000;

/** An error carrying how long Wikidata asked us to wait, when it said. */
interface WikidataError extends Error {
  retryAfterMs?: number;
}

function wikidataError(message: string, retryAfterMs?: number): WikidataError {
  const error: WikidataError = new Error(message);
  error.retryAfterMs = retryAfterMs;
  return error;
}

/** Parse a Retry-After header given in seconds. */
function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

export interface WikidataAwards {
  /** Total awards won, across every award body Wikidata knows about. */
  wins: number;
  /** Total nominations that did not become wins. */
  nominations: number;
  /** Of those wins, how many are Academy Awards. */
  oscarWins: number;
  /** Of those nominations, how many are Academy Awards. */
  oscarNominations: number;
}

/**
 * Both Wikidata endpoints throw rather than return null on failure, and that
 * distinction carries weight: a dropped response must not be read as "this
 * title won nothing". Wikimedia throttles bursts, and swallowing that would
 * silently under-report awards. Failures propagate so React Query can retry;
 * only a genuine absence of data returns null.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        // Browsers refuse to set User-Agent, so Wikimedia reads this instead.
        "Api-User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      // Wikimedia throttles bursts with a 429 and a Retry-After in seconds.
      throw wikidataError(
        `Wikidata responded ${response.status}`,
        retryAfterMs(response),
      );
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/** Find the Wikidata item that carries this IMDb id, if there is one. */
async function findEntityId(imdbId: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `haswbstatement:${P_IMDB_ID}=${imdbId}`,
    srnamespace: "0",
    srlimit: "1",
    format: "json",
    // Required for CORS on the web and desktop builds.
    origin: "*",
  });
  const response = await fetchWithTimeout(
    `${WIKIDATA_API}?${params}`,
    SEARCH_TIMEOUT_MS,
  );
  const body = await response.json();
  // MediaWiki reports its own errors with a 200.
  if (body?.error) {
    throw wikidataError(`Wikidata error: ${body.error.code ?? "unknown"}`);
  }
  const title = body?.query?.search?.[0]?.title;
  return typeof title === "string" ? title : null;
}

/**
 * Every award tied to this title, won or nominated, flagged for Oscar-ness.
 *
 * The two `pq:P1686` ("for work") branches are what make the counts match what
 * people expect. Most craft Oscars — cinematography, editing, score — are
 * recorded against the person who won them rather than the film, so reading
 * only the film's own statements reports Dune as winning nothing when it won
 * six. Oscar-ness is decided structurally, by the category being part of or an
 * instance of the Academy Awards, rather than by matching label text.
 */
const awardsQuery = (
  entityId: string,
) => `SELECT DISTINCT ?type ?award ?isOscar WHERE {
  { wd:${entityId} p:P166 ?s . ?s ps:P166 ?award . BIND("won" AS ?type) }
  UNION { wd:${entityId} p:P1411 ?s . ?s ps:P1411 ?award . BIND("nom" AS ?type) }
  UNION { ?w p:P166 ?s . ?s ps:P166 ?award ; pq:P1686 wd:${entityId} . BIND("won" AS ?type) }
  UNION { ?w p:P1411 ?s . ?s ps:P1411 ?award ; pq:P1686 wd:${entityId} . BIND("nom" AS ?type) }
  BIND(EXISTS { ?award (wdt:P361|wdt:P31) wd:Q19020 } AS ?isOscar)
}`;

interface SparqlBinding {
  type?: { value?: string };
  award?: { value?: string };
  isOscar?: { value?: string };
}

export async function fetchWikidataAwards(
  imdbId: string,
): Promise<WikidataAwards | null> {
  const entityId = await findEntityId(imdbId);
  if (!entityId) return null;
  // The id goes straight into a query, so refuse anything that is not the
  // Q-number the search is supposed to return.
  if (!/^Q\d+$/.test(entityId)) return null;

  const params = new URLSearchParams({ query: awardsQuery(entityId) });
  const response = await fetchWithTimeout(
    `${WIKIDATA_SPARQL}?${params}`,
    SPARQL_TIMEOUT_MS,
  );
  const body = await response.json();
  const bindings: SparqlBinding[] = body?.results?.bindings ?? [];

  const won = new Set<string>();
  const nominated = new Set<string>();
  const oscars = new Set<string>();
  for (const row of bindings) {
    const award = row.award?.value;
    if (!award) continue;
    if (row.isOscar?.value === "true") oscars.add(award);
    if (row.type?.value === "won") won.add(award);
    else if (row.type?.value === "nom") nominated.add(award);
  }
  // Wikidata often records both the nomination and the win for the same award.
  // Counting it twice would read as an extra nomination that never happened.
  for (const award of won) nominated.delete(award);

  if (won.size === 0 && nominated.size === 0) return null;

  const countOscars = (set: Set<string>) =>
    [...set].filter((award) => oscars.has(award)).length;

  return {
    wins: won.size,
    nominations: nominated.size,
    oscarWins: countOscars(won),
    oscarNominations: countOscars(nominated),
  };
}

/**
 * Award and Oscar status for an item, from Wikidata.
 *
 * Silent by design — it returns null rather than surfacing an error, because
 * this is decoration on a detail page. It stays null when the lookup is turned
 * off, when Jellyfin has no IMDb id for the item, when Wikidata has no matching
 * item or records no awards for it, or when a request fails.
 */
export function useWikidataAwards(item?: BaseItemDto | null) {
  const { settings } = useSettings();

  const imdbId = item?.ProviderIds?.Imdb;
  // Awards only mean anything for a whole title, not a single episode.
  const isSupportedType = item?.Type === "Movie" || item?.Type === "Series";
  // This is the only thing that reaches Wikidata, so turning the setting off
  // stops the request rather than just hiding the badge. Treated as on unless
  // explicitly false, so an older stored settings blob keeps working.
  const lookupEnabled = settings?.wikidataAwardsEnabled !== false;
  const enabled = Boolean(lookupEnabled && imdbId && isSupportedType);

  const { data } = useQuery({
    queryKey: ["wikidata", "awards", imdbId],
    enabled,
    staleTime: STALE_TIME_MS,
    // Wikimedia throttles bursts, so give a failed lookup one more go before
    // giving up — waiting as long as it asked us to, since retrying sooner
    // just earns another 429. A title with no awards resolves to null
    // successfully and is never retried.
    retry: 1,
    retryDelay: (_attempt, error: WikidataError) =>
      Math.min(
        error?.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS,
        MAX_RETRY_DELAY_MS,
      ),
    queryFn: () => fetchWikidataAwards(imdbId as string),
  });

  // `enabled: false` stops the next request but still hands back anything
  // already cached, so turning the setting off would otherwise leave the badge
  // on screen for every title looked up beforehand.
  return lookupEnabled ? (data ?? null) : null;
}

export default useWikidataAwards;
