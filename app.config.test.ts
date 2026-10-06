import { readFileSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";
import type { ConfigContext } from "expo/config";
import resolveConfig from "./app.config";

// Google Play rejects any new app or update that targets a lower API level
// (36 since August 31, 2026, TV builds only need 34). Raise this when Play
// raises the floor.
// https://developer.android.com/google/play/requirements/target-sdk
const PLAY_MIN_TARGET_SDK = 36;

// Without a pin the target comes from React Native's version catalog. A pin in
// expo-build-properties is written over it, so one left behind by an older SDK
// lowers the target without any error until the store refuses the upload.
const catalogTargetSdk = Number(
  readFileSync(
    join(__dirname, "node_modules/react-native/gradle/libs.versions.toml"),
    "utf8",
  ).match(/^targetSdk\s*=\s*"(\d+)"/m)?.[1],
);

const appJson = JSON.parse(readFileSync(join(__dirname, "app.json"), "utf8"));

/** The targetSdkVersion pinned in the resolved config; the last entry wins at prebuild. */
const pinnedTargetSdk = (tv: boolean): number | undefined => {
  const previous = process.env.EXPO_TV;
  process.env.EXPO_TV = tv ? "1" : "0";
  try {
    const { plugins = [] } = resolveConfig({
      config: structuredClone(appJson.expo),
    } as ConfigContext);
    const pins = plugins
      .filter(
        (
          plugin,
        ): plugin is [string, { android?: { targetSdkVersion?: number } }] =>
          Array.isArray(plugin) && plugin[0] === "expo-build-properties",
      )
      .map(([, options]) => options?.android?.targetSdkVersion)
      .filter((value) => value !== undefined);
    return pins.at(-1);
  } finally {
    // Assigning undefined would store the string "undefined".
    if (previous === undefined) delete process.env.EXPO_TV;
    else process.env.EXPO_TV = previous;
  }
};

describe.each([
  ["phone", false],
  ["TV", true],
] as const)("Android target SDK (%s build)", (_, tv) => {
  test("is at least the API level Google Play accepts", () => {
    expect(catalogTargetSdk).toBeGreaterThan(0);
    expect(pinnedTargetSdk(tv) ?? catalogTargetSdk).toBeGreaterThanOrEqual(
      PLAY_MIN_TARGET_SDK,
    );
  });

  test("is never pinned below React Native's default", () => {
    expect(pinnedTargetSdk(tv) ?? catalogTargetSdk).toBeGreaterThanOrEqual(
      catalogTargetSdk,
    );
  });
});

// app.config.ts registers the tsx require hook for the Expo CLI. Registered
// from a spec, it lands on Node's own loader, which the Jest worker shares
// with every spec it runs afterwards. The hook then outlives the spec that
// loaded it and reads globals of a sandbox that is gone, so the next file
// Babel had to load in that worker failed with "URLSearchParams is not a
// constructor". Which suite paid for it depended on how the workers were
// dealt their files, hence the intermittent utils/stickyHeader failure in CI.
test("loading the config leaves Node's module loader alone", () => {
  // The loader's handlers, one per file extension. Internal to Node, so untyped.
  const { _extensions: handlers } = Module as unknown as {
    _extensions: Record<string, unknown>;
  };
  const before = { ...handlers };
  jest.isolateModules(() => {
    require("./app.config");
  });
  expect({ ...handlers }).toEqual(before);
});
