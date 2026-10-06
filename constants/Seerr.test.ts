import * as stored from "./Seerr";

// The legacy names are what earlier builds wrote to devices: the migrations
// only find that data if these stay exactly what those builds used.
test("the names Seerr data is stored under", () => {
  expect(stored).toMatchObject({
    SEERR_USER_STORAGE_KEY: "SEERR_USER",
    SEERR_COOKIES_STORAGE_KEY: "SEERR_COOKIES",
    SEERR_PASSWORD_KEY_PREFIX: "seerrpw_",
    LEGACY_SEERR_USER_STORAGE_KEY: "JELLYSEERR_USER",
    LEGACY_SEERR_COOKIES_STORAGE_KEY: "JELLYSEERR_COOKIES",
    LEGACY_SEERR_PASSWORD_KEY_PREFIX: "jellyseerrpw_",
    LEGACY_SEERR_HEADERS_NAME: "jellyseerr",
  });
});
