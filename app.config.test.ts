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

/** The plugins of the resolved config, for a phone or a TV build. */
const resolvedPlugins = (tv: boolean) => {
  const previous = process.env.EXPO_TV;
  process.env.EXPO_TV = tv ? "1" : "0";
  try {
    return (
      resolveConfig({
        config: structuredClone(appJson.expo),
      } as ConfigContext).plugins ?? []
    );
  } finally {
    // Assigning undefined would store the string "undefined".
    if (previous === undefined) delete process.env.EXPO_TV;
    else process.env.EXPO_TV = previous;
  }
};

/** The targetSdkVersion pinned in the resolved config; the last entry wins at prebuild. */
const pinnedTargetSdk = (tv: boolean): number | undefined => {
  const pins = resolvedPlugins(tv)
    .filter(
      (
        plugin,
      ): plugin is [string, { android?: { targetSdkVersion?: number } }] =>
        Array.isArray(plugin) && plugin[0] === "expo-build-properties",
    )
    .map(([, options]) => options?.android?.targetSdkVersion)
    .filter((value) => value !== undefined);
  return pins.at(-1);
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

/** The ProGuard rules the resolved config adds to a release build. */
const extraProguardRules = (tv: boolean): string[] =>
  resolvedPlugins(tv)
    .filter(
      (
        plugin,
      ): plugin is [string, { android?: { extraProguardRules?: string } }] =>
        Array.isArray(plugin) && plugin[0] === "expo-build-properties",
    )
    .flatMap(([, options]) =>
      (options?.android?.extraProguardRules ?? "").split("\n"),
    );

// With R8 on, Media3's exceptions are renamed, so the class name the players
// add to a playback error's message came out as a letter or two in the logs
// and in Sentry, which maps stack traces back but not message text.
test.each([
  ["phone", false],
  ["TV", true],
] as const)(
  "keeps the class names of exceptions in a %s release build",
  (_, tv) => {
    expect(extraProguardRules(tv)).toContain(
      "-keepnames class * extends java.lang.Throwable",
    );
  },
);

// AGP 9 runs R8 in full mode, which drops the constructor of a class a library
// keeps without naming its members. Room's database and the input merger of
// every one-time WorkManager request are created by reflection: without them
// WorkManager failed at startup, and every background task run failed.
test.each([
  ["phone", false],
  ["TV", true],
] as const)(
  "keeps the constructors WorkManager creates by reflection in a %s release build",
  (_, tv) => {
    expect(extraProguardRules(tv)).toEqual(
      expect.arrayContaining([
        "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
        "-keep class * extends androidx.work.InputMerger { <init>(); }",
      ]),
    );
  },
);

// The Cast SDK is configured by the native module itself; the plugin only
// writes what the module reads at launch (the receiver id, the Bonjour
// services), and TV builds carry no Cast at all.
test("registers the Cast plugin with the Jellyfin receiver on phone builds only", () => {
  const phone = resolvedPlugins(false).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "./plugins/withCast.ts",
  );

  expect(phone).toEqual([
    "./plugins/withCast.ts",
    { receiverAppId: "F007D354" },
  ]);
  expect(resolvedPlugins(false).flat()).not.toContain(
    "react-native-google-cast",
  );
  expect(resolvedPlugins(true).flat()).not.toContain("./plugins/withCast.ts");
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

// A repack rewrites the build number of the app and its extensions from the
// config, "1" when it has none: an EAS build's number would be lost, and with
// it the release Sentry files the build's crashes under.
test("takes the build number of the IPA a repack starts from", () => {
  const previous = process.env.REPACK_IOS_BUILD_NUMBER;
  process.env.REPACK_IOS_BUILD_NUMBER = "309";
  try {
    const resolved = resolveConfig({
      config: structuredClone(appJson.expo),
    } as ConfigContext);
    expect(resolved.ios?.buildNumber).toBe("309");
    expect(resolved.ios?.bundleIdentifier).toBe(
      appJson.expo.ios.bundleIdentifier,
    );
  } finally {
    if (previous === undefined) delete process.env.REPACK_IOS_BUILD_NUMBER;
    else process.env.REPACK_IOS_BUILD_NUMBER = previous;
  }
});

test("leaves the build number alone outside a repack", () => {
  const resolved = resolveConfig({
    config: structuredClone(appJson.expo),
  } as ConfigContext);
  expect(resolved.ios?.buildNumber).toBe(appJson.expo.ios?.buildNumber);
});
