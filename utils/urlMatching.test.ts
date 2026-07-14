import { describe, expect, test } from "bun:test";
import { isUrlForBaseUrl, normalizeHttpBaseUrl } from "./urlMatching";

describe("normalizeHttpBaseUrl", () => {
  test("defaults bare hosts to https and trims one trailing slash", () => {
    expect(normalizeHttpBaseUrl("example.test/")).toBe("https://example.test");
    expect(normalizeHttpBaseUrl("http://example.test/")).toBe(
      "http://example.test",
    );
  });
});

describe("isUrlForBaseUrl", () => {
  test("matches equivalent URLs when only the default port differs", () => {
    expect(
      isUrlForBaseUrl(
        "https://jellyfin.example.test:443/Items/1/Images/Primary",
        "https://jellyfin.example.test",
      ),
    ).toBe(true);
  });

  test("matches same-origin URLs for a root base URL", () => {
    expect(
      isUrlForBaseUrl(
        "https://jellyfin.example.test/Items/1/Images/Primary",
        "https://jellyfin.example.test",
      ),
    ).toBe(true);
  });

  test("matches URLs under a configured base path", () => {
    expect(
      isUrlForBaseUrl(
        "https://example.test/jellyfin/Items/1/Images/Primary",
        "https://example.test/jellyfin",
      ),
    ).toBe(true);
  });

  test("matches the configured base path exactly", () => {
    expect(
      isUrlForBaseUrl(
        "https://example.test/jellyfin",
        "https://example.test/jellyfin",
      ),
    ).toBe(true);
  });

  test("does not match sibling paths with the same prefix", () => {
    expect(
      isUrlForBaseUrl(
        "https://example.test/jellyfinx/Items/1/Images/Primary",
        "https://example.test/jellyfin",
      ),
    ).toBe(false);
  });

  test("does not match different hosts or protocols", () => {
    expect(
      isUrlForBaseUrl(
        "https://other.example.test/Items/1/Images/Primary",
        "https://jellyfin.example.test",
      ),
    ).toBe(false);
    expect(
      isUrlForBaseUrl(
        "http://jellyfin.example.test/Items/1/Images/Primary",
        "https://jellyfin.example.test",
      ),
    ).toBe(false);
  });

  test("returns false for invalid URLs", () => {
    expect(isUrlForBaseUrl("not a url", "https://jellyfin.example.test")).toBe(
      false,
    );
    expect(
      isUrlForBaseUrl(
        "https://jellyfin.example.test/Items/1/Images/Primary",
        "",
      ),
    ).toBe(false);
  });
});
