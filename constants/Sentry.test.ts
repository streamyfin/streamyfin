import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICIAL_APPLICATION_IDS } from "./Sentry";

const { expo } = JSON.parse(
  readFileSync(join(__dirname, "..", "app.json"), "utf8"),
);

// Only builds carrying these identifiers report into the project's Sentry
// (utils/sentry.ts). The list is a constant and not a runtime read of the
// config so that a fork's rename does not move it, which means nothing but
// this test keeps it in step with the identifiers the project really ships.
// A fork that renames the app should leave the constant alone and point
// EXPO_PUBLIC_SENTRY_DSN at its own project.
describe("OFFICIAL_APPLICATION_IDS", () => {
  test("holds the iOS and tvOS bundle identifier of app.json", () => {
    expect(OFFICIAL_APPLICATION_IDS).toContain(expo.ios.bundleIdentifier);
  });

  test("holds the Android application id of app.json", () => {
    expect(OFFICIAL_APPLICATION_IDS).toContain(expo.android.package);
  });

  test("holds nothing else", () => {
    expect([...OFFICIAL_APPLICATION_IDS].sort()).toEqual(
      [...new Set([expo.ios.bundleIdentifier, expo.android.package])].sort(),
    );
  });
});
