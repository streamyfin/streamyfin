import { requireOnPlatform } from "@/test-utils/reactNative";
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

// A phone draws a backdrop at most 1206 pixels wide: Seerr's web size, made for a desktop
// screen, weighs three times its 1000 pixel version. A TV draws it full screen.
describe("the backdrop size", () => {
  const sizeOn = (isTV: boolean): string =>
    requireOnPlatform(
      { isTV },
      () =>
        (require("./Seerr") as typeof import("./Seerr")).SEERR_BACKDROP_SIZE,
    );

  test("is the 1000 pixel crop on a phone", () => {
    expect(sizeOn(false)).toBe("w1000_and_h450_multi_faces");
  });

  test("is Seerr's full size on a TV", () => {
    expect(sizeOn(true)).toBe("w1920_and_h800_multi_faces");
  });
});
