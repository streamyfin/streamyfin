import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { measureFunction } from "reassure";
import { queryDehydrateOptions } from "./queryPersistence";

// Baseline for saving the query cache (.scratchpad tv-performance ticket 01).
// The persister turns the whole dehydrated cache into one JSON string on the
// JS thread, at most once a second while queries change. This measures that
// work on a cache shaped like a TV session: the Home screen, a library browsed
// ten pages deep, and a few item pages.

const OVERVIEW =
  "A retired operative is pulled back for one last job when an old ally " +
  "resurfaces with a list of names nobody was supposed to keep. What starts " +
  "as a simple recovery turns into a chase across three continents, and the " +
  "closer the list gets, the fewer people can be trusted to hold it. ".repeat(
    2,
  );

const item = (id: string): BaseItemDto => ({
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

const sessionCache = () => {
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
  return client;
};

// One save takes well under a millisecond in Node, where timer noise alone
// reads as a 10% change; ten per run gives the comparison something to hold.
const SAVES_PER_RUN = 10;

test("saving the query cache of a TV session ten times", async () => {
  const client = sessionCache();

  // What the persister does on each save: dehydrate with the app's rules,
  // then serialise for MMKV.
  await measureFunction(() => {
    for (let save = 0; save < SAVES_PER_RUN; save++) {
      JSON.stringify({
        buster: "",
        timestamp: Date.now(),
        clientState: dehydrate(client, queryDehydrateOptions),
      });
    }
  });
  // Its garbage collection timers would keep Jest from exiting.
  client.clear();
});
