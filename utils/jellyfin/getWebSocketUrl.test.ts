import { getWebSocketUrl } from "./getWebSocketUrl";

describe("getWebSocketUrl", () => {
  test("https server → wss socket authenticated with ApiKey", () => {
    const url = getWebSocketUrl(
      "https://jellyfin.example.com",
      "SECRET_TOKEN",
      "device-1",
    );

    const parsed = new URL(url);
    expect(parsed.protocol).toBe("wss:");
    expect(parsed.host).toBe("jellyfin.example.com");
    expect(parsed.pathname).toBe("/socket");
    expect(parsed.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
    expect(parsed.searchParams.get("deviceId")).toBe("device-1");
  });

  test("http server → ws socket", () => {
    const url = getWebSocketUrl("http://192.168.1.10:8096", "T", "d");

    expect(url.startsWith("ws://192.168.1.10:8096/socket?")).toBe(true);
  });

  test("keeps the base path of a server behind a reverse-proxy subpath", () => {
    const url = getWebSocketUrl("https://example.com/jellyfin", "T", "d");

    expect(new URL(url).pathname).toBe("/jellyfin/socket");
  });
});
