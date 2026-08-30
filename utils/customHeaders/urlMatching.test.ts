import { describe, expect, test } from "bun:test";
import { isUrlForBaseUrl, normalizeHttpBaseUrl } from "./urlMatching";

describe("normalizeHttpBaseUrl", () => {
  test("adds https to a bare host and strips the trailing slash", () => {
    expect(normalizeHttpBaseUrl("jellyfin.example.com/")).toBe(
      "https://jellyfin.example.com",
    );
  });

  test("keeps an explicit protocol", () => {
    expect(normalizeHttpBaseUrl("http://192.168.1.10:8096")).toBe(
      "http://192.168.1.10:8096",
    );
  });

  test("strips every trailing slash, so applying it again changes nothing", () => {
    const once = normalizeHttpBaseUrl("https://jellyfin.example.com//");
    expect(once).toBe("https://jellyfin.example.com");
    expect(normalizeHttpBaseUrl(once)).toBe(once);
  });
});

describe("isUrlForBaseUrl", () => {
  const base = "https://jellyfin.example.com";

  test("matches URLs on the same origin", () => {
    expect(isUrlForBaseUrl(`${base}/Items/1/Images/Primary`, base)).toBe(true);
  });

  test("rejects other hosts, protocols and ports", () => {
    expect(isUrlForBaseUrl("https://image.tmdb.org/t/p/w500/a.jpg", base)).toBe(
      false,
    );
    expect(isUrlForBaseUrl("http://jellyfin.example.com/Items", base)).toBe(
      false,
    );
    expect(isUrlForBaseUrl("https://jellyfin.example.com:8096/x", base)).toBe(
      false,
    );
  });

  test("scopes to the base path when the server is hosted under one", () => {
    const pathBase = "https://example.com/jellyfin";
    expect(
      isUrlForBaseUrl("https://example.com/jellyfin/Items", pathBase),
    ).toBe(true);
    expect(isUrlForBaseUrl("https://example.com/jellyfin", pathBase)).toBe(
      true,
    );
    expect(isUrlForBaseUrl("https://example.com/jellyfinx", pathBase)).toBe(
      false,
    );
    expect(isUrlForBaseUrl("https://example.com/other", pathBase)).toBe(false);
  });

  test("returns false for unparseable input", () => {
    expect(isUrlForBaseUrl("not a url", base)).toBe(false);
    expect(isUrlForBaseUrl(`${base}/Items`, "")).toBe(false);
    expect(isUrlForBaseUrl("", base)).toBe(false);
  });

  test("does not let a dot segment escape the base path", () => {
    const pathBase = "https://example.com/jellyfin";
    expect(
      isUrlForBaseUrl("https://example.com/jellyfin/../other/x", pathBase),
    ).toBe(false);
  });

  test("matches an origin written differently from the base", () => {
    expect(
      isUrlForBaseUrl("https://jellyfin.example.com:443/Items", base),
    ).toBe(true);
  });
});
