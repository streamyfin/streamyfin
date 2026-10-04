import { getExplicitServerUrl, isHttpUrl } from "./candidates";

describe("isHttpUrl", () => {
  test("accepts what the app can use as a server base", () => {
    expect(isHttpUrl("http://192.168.1.10:8096")).toBe(true);
    expect(isHttpUrl("https://example.com/jellyfin")).toBe(true);
  });

  // REACT-NATIVE-6C: these are the shapes a local URL was saved in.
  test("rejects an address without its scheme", () => {
    expect(isHttpUrl("192.168.1.10")).toBe(false);
    expect(isHttpUrl("192.168.1.10:8096")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });

  // These parse, which is why "does new URL throw" is not the question.
  test("rejects an address whose host reads as a scheme", () => {
    expect(isHttpUrl("localhost:8096")).toBe(false);
    expect(isHttpUrl("jellyfin.local:8096")).toBe(false);
  });

  test("rejects a scheme with nothing usable behind it", () => {
    expect(isHttpUrl("http://")).toBe(false);
    expect(isHttpUrl("ftp://192.168.1.10")).toBe(false);
  });
});

describe("getExplicitServerUrl", () => {
  test("returns the canonical URL when the scheme was typed", () => {
    expect(getExplicitServerUrl(" HTTP://Jellyfin.Local:8096/ ")).toBe(
      "http://jellyfin.local:8096",
    );
    expect(getExplicitServerUrl("https://example.com/jellyfin/?a=1")).toBe(
      "https://example.com/jellyfin",
    );
  });

  // https or http: only a server answering can tell, so nothing is guessed.
  test("returns null when the scheme was left out", () => {
    expect(getExplicitServerUrl("192.168.1.10")).toBeNull();
    expect(getExplicitServerUrl("192.168.1.10:8096")).toBeNull();
    expect(getExplicitServerUrl("localhost:8096/jellyfin")).toBeNull();
  });

  test("returns null for input that is not an address", () => {
    expect(getExplicitServerUrl("")).toBeNull();
    expect(getExplicitServerUrl("http://not an address")).toBeNull();
    expect(getExplicitServerUrl("http://exa<mple")).toBeNull();
  });
});
