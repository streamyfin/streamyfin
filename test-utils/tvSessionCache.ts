import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type DehydrateOptions,
  dehydrate,
  QueryClient,
} from "@tanstack/react-query";

/**
 * A query cache shaped like a TV session: the Home screen, a library browsed
 * ten pages deep, a few item pages and searches. The perf scenarios time
 * saving and restoring it; queryPersistence.test.ts checks how much of it the
 * allowlist keeps, which a perf scenario cannot, since the baseline runs it
 * against the base branch's broader policy.
 */

const OVERVIEW =
  "A retired operative is pulled back for one last job when an old ally " +
  "resurfaces with a list of names nobody was supposed to keep. What starts " +
  "as a simple recovery turns into a chase across three continents, and the " +
  "closer the list gets, the fewer people can be trusted to hold it. ".repeat(
    2,
  );

// The cache holds what the API client parsed, and JSON.parse makes flat
// strings. Strings built here with + or a template literal are V8 cons
// strings, which the JSON.stringify fast path refuses until a garbage
// collection swaps them for flat ones: the number would follow the GC timing.
const fromResponse = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const item = (id: string): BaseItemDto =>
  fromResponse<BaseItemDto>({
    Id: id,
    Name: `Title ${id}`,
    ServerId: "server-1",
    Type: "Movie",
    Overview: OVERVIEW,
    ProductionYear: 2019,
    OfficialRating: "PG-13",
    CommunityRating: 7.4,
    RunTimeTicks: 72_000_000_000,
    PremiereDate: "2019-06-14T00:00:00.0000000Z",
    Genres: ["Action", "Thriller"],
    PrimaryImageAspectRatio: 0.6666666666666666,
    ImageTags: { Primary: `primary-${id}`, Thumb: `thumb-${id}` },
    BackdropImageTags: [`backdrop-${id}`],
    ImageBlurHashes: {
      Primary: { [`primary-${id}`]: "dcF~XIofDhR*4mWBofs:M_ofxuWB%Mj[V@ay" },
      Backdrop: { [`backdrop-${id}`]: "WDCZX?j[00ay~qofM{WBRjj[ofay-;ayt7j[" },
    },
    UserData: {
      PlaybackPositionTicks: 0,
      PlayCount: 0,
      IsFavorite: false,
      Played: false,
      Key: id,
    },
    LocationType: "FileSystem",
    MediaType: "Video",
  });

const items = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => item(`${prefix}-${index}`));

export const sessionCache = () => {
  const client = new QueryClient();
  client.setQueryData(["home", "userViews", "user-1"], items("view", 4));
  client.setQueryData(["home", "heroItems", "user-1"], items("hero", 15));
  for (const row of [
    "resumeItems",
    "nextUp-all",
    "recentlyAddedInmovies",
    "recentlyAddedIntvshows",
    "suggestedMovies",
  ]) {
    client.setQueryData(["home", row], {
      pages: [items(row, 10), items(`${row}-2`, 10)],
      pageParams: [0, 10],
    });
  }
  client.setQueryData(["library-items", "movies", "items"], {
    pages: Array.from({ length: 10 }, (_, page) => ({
      Items: items(`library-${page}`, 36),
      TotalRecordCount: 2000,
    })),
    pageParams: Array.from({ length: 10 }, (_, page) => page * 36),
  });
  for (let index = 0; index < 20; index++) {
    client.setQueryData(["item", `detail-${index}`], item(`detail-${index}`));
  }
  for (let index = 0; index < 5; index++) {
    client.setQueryData(["search", "movies", `query-${index}`], {
      Items: items(`search-${index}`, 24),
    });
  }
  return client;
};

/** What the persister writes to MMKV on each save. */
export const save = (client: QueryClient, options: DehydrateOptions) =>
  JSON.stringify({
    buster: "",
    timestamp: Date.now(),
    clientState: dehydrate(client, options),
  });
