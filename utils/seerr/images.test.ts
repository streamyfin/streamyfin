import { episodeStillUrl, resizedImageUrl, tmdbImageUrl } from "./images";

const base = "https://seerr.example";

describe("tmdbImageUrl", () => {
  // As Seerr's own app loads them (CachedImage): from TMDB, at the size in the URL. They went
  // through Next.js's resizer, which re-encoded every image on the Seerr server and left its
  // image cache unused.
  test("asks TMDB for the image at the size it is drawn", () => {
    expect(tmdbImageUrl(base, "/abc.jpg", "w300_and_h450_face", false)).toBe(
      "https://image.tmdb.org/t/p/w300_and_h450_face/abc.jpg",
    );
  });

  // An admin who turns image caching on has Seerr keep every image it serves.
  test("goes through Seerr's image cache when the server keeps one", () => {
    expect(tmdbImageUrl(base, "/abc.jpg", "w300_and_h450_face", true)).toBe(
      `${base}/imageproxy/tmdb/t/p/w300_and_h450_face/abc.jpg`,
    );
  });

  // The caller picks its own placeholder, whatever the server calls its own:
  // Seerr renamed it twice.
  test("has no URL without a path", () => {
    expect(tmdbImageUrl(base, undefined, "w342", false)).toBeUndefined();
    expect(tmdbImageUrl(base, null, "w342", false)).toBeUndefined();
    expect(tmdbImageUrl(base, "", "w342", true)).toBeUndefined();
  });
});

describe("resizedImageUrl", () => {
  test("hands a full URL to Seerr's resizer", () => {
    expect(
      resizedImageUrl(base, "https://artworks.thetvdb.com/a/1.jpg", 640),
    ).toBe(
      `${base}/_next/image?url=https%3A%2F%2Fartworks.thetvdb.com%2Fa%2F1.jpg&w=640&q=75`,
    );
  });
});

describe("episodeStillUrl", () => {
  test("asks for a TMDB path at a thumbnail's size", () => {
    expect(episodeStillUrl(base, "/abc.jpg", false)).toBe(
      "https://image.tmdb.org/t/p/w300/abc.jpg",
    );
  });

  // Seerr 3 turns every TMDB still into the full-size original
  // (server/api/themoviedb/index.ts, getTvSeason): 1920 wide, for a frame
  // drawn 128 points wide.
  test("asks for the thumbnail of the original Seerr 3 sends", () => {
    expect(
      episodeStillUrl(
        base,
        "https://image.tmdb.org/t/p/original//abc.jpg",
        false,
      ),
    ).toBe("https://image.tmdb.org/t/p/w300/abc.jpg");
  });

  test("goes through Seerr's image cache when the server keeps one", () => {
    expect(
      episodeStillUrl(
        base,
        "https://image.tmdb.org/t/p/original//abc.jpg",
        true,
      ),
    ).toBe(`${base}/imageproxy/tmdb/t/p/w300/abc.jpg`);
  });

  // A series whose metadata comes from TheTVDB gets its full artwork URLs,
  // which no TMDB path can stand for: the app showed an empty frame for every
  // episode of La casa de papel. TheTVDB has no smaller size, and Seerr's
  // resizer brought one from 166 kB down to 37 kB on a test server.
  test("has TheTVDB's artwork resized by Seerr", () => {
    const url = "https://artworks.thetvdb.com/banners/episodes/1.jpg";
    for (const cacheImages of [false, true]) {
      expect(episodeStillUrl(base, url, cacheImages)).toBe(
        resizedImageUrl(base, url, 640),
      );
    }
  });

  // Seerr's resizer refuses any other host (next.config.ts, remotePatterns).
  test("keeps a full URL from another host as it is", () => {
    const url = "https://images.example/1.jpg";
    expect(episodeStillUrl(base, url, true)).toBe(url);
  });

  test("has nothing to show without a still", () => {
    expect(episodeStillUrl(base, undefined, false)).toBeUndefined();
    expect(episodeStillUrl(base, "", false)).toBeUndefined();
    expect(episodeStillUrl(base, null, false)).toBeUndefined();
  });
});
