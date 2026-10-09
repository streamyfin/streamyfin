import { AWAITED_TITLE_EVENT } from "@/constants/Notifications";
import { MediaStatus, MediaType } from "@/utils/seerr/types";
import {
  type AwaitedTitle,
  awaitRequestFrom,
  awaitTitle,
  getAwaitedTitles,
  isAwaited,
  showsAwaitButton,
  stopAwaitingTitle,
  withAwaited,
  withoutAwaited,
} from "./awaitedTitles";

const ROUTE = "/Streamyfin/v1/notifications/mine/awaited";

const matrix: AwaitedTitle = {
  mediaType: "movie",
  tmdbId: 603,
  title: "The Matrix",
  year: 1999,
  addedAt: "2026-10-08T08:00:00Z",
  arrived: false,
};

const fakeApi = () => {
  const answer = { data: [matrix] };
  return {
    get: jest.fn(async () => answer),
    post: jest.fn(async () => answer),
    delete: jest.fn(async () => answer),
  };
};

describe("the routes", () => {
  test("reads the list", async () => {
    const api = fakeApi();

    expect(await getAwaitedTitles(api as never)).toEqual([matrix]);
    expect(api.get).toHaveBeenCalledWith(ROUTE);
  });

  test("adds a title with what the plugin needs to match it", async () => {
    const api = fakeApi();
    const request = {
      mediaType: "tv",
      tmdbId: 1399,
      tvdbId: 121361,
      title: "Game of Thrones",
      year: 2011,
    } as const;

    expect(await awaitTitle(api as never, request)).toEqual([matrix]);
    expect(api.post).toHaveBeenCalledWith(ROUTE, request);
  });

  test("takes a title off by its kind and its TMDB id", async () => {
    const api = fakeApi();

    expect(await stopAwaitingTitle(api as never, "movie", 603)).toEqual([
      matrix,
    ]);
    expect(api.delete).toHaveBeenCalledWith(`${ROUTE}/movie/603`);
  });
});

describe("the list", () => {
  test("knows a title by its kind and its TMDB id", () => {
    expect(isAwaited([matrix], "movie", 603)).toBe(true);
    expect(isAwaited([matrix], "tv", 603)).toBe(false);
    expect(isAwaited(undefined, "movie", 603)).toBe(false);
  });

  // The plugin answers newest first, and the change shows the same way before it answers.
  test("puts a new title first", () => {
    const list = withAwaited(
      [matrix],
      { mediaType: "movie", tmdbId: 27205, title: "Inception", year: 2010 },
      "2026-10-08T09:00:00Z",
    );

    expect(list.map((title) => title.tmdbId)).toEqual([27205, 603]);
    expect(list[0]).toEqual({
      mediaType: "movie",
      tmdbId: 27205,
      title: "Inception",
      year: 2010,
      addedAt: "2026-10-08T09:00:00Z",
      arrived: false,
    });
  });

  test("does not add a title twice", () => {
    const again = withAwaited(
      [matrix],
      { mediaType: "movie", tmdbId: 603, title: "The Matrix" },
      "2026-10-08T09:00:00Z",
    );

    expect(again).toEqual([matrix]);
  });

  test("takes a title off", () => {
    expect(withoutAwaited([matrix], "movie", 603)).toEqual([]);
    expect(withoutAwaited([matrix], "tv", 603)).toEqual([matrix]);
  });
});

describe("what a Seerr page asks for", () => {
  test("a movie, by its title and the year it came out", () => {
    expect(
      awaitRequestFrom(
        { id: 603, title: "The Matrix", releaseDate: "1999-03-30" } as never,
        MediaType.MOVIE,
      ),
    ).toEqual({
      mediaType: "movie",
      tmdbId: 603,
      title: "The Matrix",
      year: 1999,
    });
  });

  // Many shows in Jellyfin only carry their TVDB id, so it goes along when Seerr has it.
  test("a show, by its name, its first air date and its TVDB id", () => {
    expect(
      awaitRequestFrom(
        {
          id: 1399,
          name: "Game of Thrones",
          firstAirDate: "2011-04-17",
          externalIds: { tvdbId: 121361 },
        } as never,
        MediaType.TV,
      ),
    ).toEqual({
      mediaType: "tv",
      tmdbId: 1399,
      tvdbId: 121361,
      title: "Game of Thrones",
      year: 2011,
    });
  });

  test("leaves out what Seerr does not know", () => {
    const request = awaitRequestFrom(
      { id: 1399, name: "Game of Thrones" } as never,
      MediaType.TV,
    );

    expect(request).toEqual({
      mediaType: "tv",
      tmdbId: 1399,
      title: "Game of Thrones",
    });
    expect(request && "tvdbId" in request).toBe(false);
    expect(request && "year" in request).toBe(false);
  });

  test("asks nothing for a title it cannot name", () => {
    expect(
      awaitRequestFrom({ id: 603 } as never, MediaType.MOVIE),
    ).toBeUndefined();
    expect(awaitRequestFrom(undefined, MediaType.MOVIE)).toBeUndefined();
  });
});

describe("when the button shows", () => {
  const absent = {
    id: 603,
    title: "The Matrix",
    mediaInfo: { status: MediaStatus.UNKNOWN },
  };
  const on = [{ key: AWAITED_TITLE_EVENT, family: "requests", enabled: true }];

  const shows = (over: {
    details?: unknown;
    seerrUserId?: number;
    events?: { key: string; family: string; enabled: boolean }[];
  }) =>
    showsAwaitButton({
      details: absent as never,
      seerrUserId: 7,
      events: on,
      ...over,
    } as never);

  test("for a title the server does not have, when the event reaches the person", () => {
    expect(shows({})).toBe(true);
    expect(shows({ details: { id: 603, title: "The Matrix" } })).toBe(true);
  });

  test.each([
    ["it is on the server", { mediaInfo: { status: MediaStatus.AVAILABLE } }],
    [
      "part of it is on the server",
      { mediaInfo: { status: MediaStatus.PARTIALLY_AVAILABLE } },
    ],
    [
      "Jellyfin already has it",
      { mediaInfo: { status: MediaStatus.PROCESSING, jellyfinMediaId: "abc" } },
    ],
  ])("not when %s", (_case, details) => {
    expect(shows({ details: { ...absent, ...details } })).toBe(false);
  });

  // Seerr tells the person who asked, so the button would tell them twice.
  test("not when the person asked for it themselves", () => {
    const requested = {
      ...absent,
      mediaInfo: {
        status: MediaStatus.PENDING,
        requests: [{ requestedBy: { id: 7 } }],
      },
    };
    const byAnother = {
      ...absent,
      mediaInfo: {
        status: MediaStatus.PENDING,
        requests: [{ requestedBy: { id: 8 } }],
      },
    };

    expect(shows({ details: requested })).toBe(false);
    expect(shows({ details: byAnother })).toBe(true);
  });

  test("not when the event does not reach the person, or they turned it off", () => {
    expect(shows({ events: undefined })).toBe(false);
    expect(shows({ events: [] })).toBe(false);
    expect(
      shows({
        events: [
          { key: AWAITED_TITLE_EVENT, family: "requests", enabled: false },
        ],
      }),
    ).toBe(false);
  });

  test("not before the page knows the title", () => {
    expect(shows({ details: undefined })).toBe(false);
  });
});
