import { describe, expect, test } from "bun:test";
import { episodeStillUrl, resizedImageUrl, tmdbImageUrl } from "./images";

const base = "https://seerr.example";

describe("tmdbImageUrl", () => {
  // The URL every Seerr image has had, so that images already cached by
  // expo-image keep their key.
  test("asks Seerr's resizer for a TMDB image, as the app always has", () => {
    expect(
      tmdbImageUrl(base, "/abc.jpg", {
        filter: "w300_and_h450_face",
        width: 1920,
        quality: 75,
      }),
    ).toBe(
      `${base}/_next/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw300_and_h450_face%2F%2Fabc.jpg&w=1920&q=75`,
    );
  });

  test("defaults to the original at 1920 wide", () => {
    expect(tmdbImageUrl(base, "/abc.jpg")).toBe(
      `${base}/_next/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Foriginal%2F%2Fabc.jpg&w=1920&q=75`,
    );
  });

  // The caller picks its own placeholder, whatever the server calls its own:
  // Seerr renamed it twice.
  test("has no URL without a path", () => {
    expect(tmdbImageUrl(base, undefined)).toBeUndefined();
    expect(tmdbImageUrl(base, null)).toBeUndefined();
    expect(tmdbImageUrl(base, "")).toBeUndefined();
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
  const thumbnail = tmdbImageUrl(base, "/abc.jpg", {
    filter: "w300",
    width: 640,
  });

  test("asks for a TMDB path at a thumbnail's size", () => {
    expect(episodeStillUrl(base, "/abc.jpg")).toBe(thumbnail);
  });

  // Seerr 3 turns every TMDB still into the full-size original
  // (server/api/themoviedb/index.ts, getTvSeason): 1920 wide, for a frame
  // drawn 128 points wide.
  test("asks for the thumbnail of the original Seerr 3 sends", () => {
    expect(
      episodeStillUrl(base, "https://image.tmdb.org/t/p/original//abc.jpg"),
    ).toBe(thumbnail);
  });

  // A series whose metadata comes from TheTVDB gets its full artwork URLs,
  // which no TMDB path can stand for: the app showed an empty frame for every
  // episode of La casa de papel. Seerr's resizer takes their host, and brought
  // one from 166 kB down to 37 kB on a test server.
  test("has TheTVDB's artwork resized by Seerr", () => {
    const url = "https://artworks.thetvdb.com/banners/episodes/1.jpg";
    expect(episodeStillUrl(base, url)).toBe(resizedImageUrl(base, url, 640));
  });

  // Seerr's resizer refuses any other host (next.config.ts, remotePatterns).
  test("keeps a full URL from another host as it is", () => {
    const url = "https://images.example/1.jpg";
    expect(episodeStillUrl(base, url)).toBe(url);
  });

  test("has nothing to show without a still", () => {
    expect(episodeStillUrl(base, undefined)).toBeUndefined();
    expect(episodeStillUrl(base, "")).toBeUndefined();
    expect(episodeStillUrl(base, null)).toBeUndefined();
  });
});
