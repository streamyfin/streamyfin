import { stripLegacyRoutePrefix } from "./legacyRoutePrefix";

// Jellyfin 12 dropped the `/emby` and `/mediabrowser` route aliases
// (jellyfin/jellyfin#15669), so an address saved with one 404s after the
// server upgrades.
describe("stripLegacyRoutePrefix", () => {
  test.each([
    ["https://host/emby", "https://host"],
    ["https://host/emby/", "https://host"],
    ["https://host/EMBY", "https://host"],
    ["https://host/mediabrowser", "https://host"],
    ["https://host/MediaBrowser//", "https://host"],
    ["http://10.0.0.5:8096/emby", "http://10.0.0.5:8096"],
    ["http://[::1]:8096/emby", "http://[::1]:8096"],
    ["host:8096/emby", "host:8096"],
    ["user:pass@host/emby", "user:pass@host"],
    ["https://admin@host:8096/emby", "https://admin@host:8096"],
    ["https://host/jellyfin/emby", "https://host/jellyfin"],
    ["https://host//emby", "https://host"],
  ])("strips the legacy segment from %s", (input, expected) => {
    expect(stripLegacyRoutePrefix(input)).toBe(expected);
  });

  test.each([
    "https://host",
    "https://host/jellyfin",
    "https://host/jellyfin/",
    "https://host/embyserver",
    "https://host/emby/jellyfin",
    "https://emby",
    "https://emby.example.com",
    "emby",
    "emby:8096",
    "",
  ])("leaves %s alone", (input) => {
    expect(stripLegacyRoutePrefix(input)).toBe(input);
  });
});
