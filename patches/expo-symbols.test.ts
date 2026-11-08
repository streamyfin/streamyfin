import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react-native";
import { createElement } from "react";
import { Platform } from "react-native";

// On Android, SymbolView draws the Material Symbol as a Text glyph inside
// a View fixed at `size` square. The glyph followed the system font scale and
// the box did not, so a larger font size clipped every header icon
// (streamyfin/streamyfin#2330). The patch turns font scaling off for that glyph,
// matching the native SF Symbol on iOS.
//
// The patch is keyed to one expo-symbols version and silently stops applying
// to any other, so after a bump the version spec fails first. Regenerate the
// patch with `bun patch expo-symbols`. If the glyph spec passes with the patch
// entry removed, upstream has fixed it: delete the patch instead.

jest.mock("expo-font", () => ({ loadAsync: () => Promise.resolve() }));

// The exports map hides package.json, so the root comes from the entry point.
const root = path.resolve(require.resolve("expo-symbols"), "../..");
const installedVersion: string = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const patchedVersions = Object.keys(
  require("@/package.json").patchedDependencies,
)
  .filter((key) => key.startsWith("expo-symbols@"))
  .map((key) => key.slice("expo-symbols@".length));

it("keys the patch to the installed expo-symbols", () => {
  expect(patchedVersions).toEqual([installedVersion]);
});

// The patch covers both copies: Metro loads build/ by default and src/ under
// the `expo-source` condition, which newer versions export. A version that
// ships no src/ has nothing there to check. The explicit extensions skip the
// `.ios` variant that Jest would otherwise resolve.
const builds = Object.entries({
  build: path.join(root, "build/SymbolView.js"),
  src: path.join(root, "src/SymbolView.tsx"),
}).filter(([, file]) => existsSync(file));

it("finds the Android SymbolView in the compiled build", () => {
  expect(builds.map(([name]) => name)).toContain("build");
});

describe.each(builds)("expo-symbols %s", (_, file) => {
  // Jest resolves the iOS `utils`, whose getFont returns no font at all.
  beforeAll(() => {
    jest.mock(path.join(path.dirname(file), "utils"), () => ({
      getFont: () => ({ name: "MaterialSymbols", font: 1 }),
    }));
  });
  beforeEach(() => jest.replaceProperty(Platform, "OS", "android"));
  afterEach(() => jest.restoreAllMocks());

  it("keeps the Android glyph at its box size under a larger font scale", async () => {
    const { SymbolView } = require(file);
    await render(
      createElement(SymbolView, { name: { android: "settings" }, size: 24 }),
    );

    const glyph = await screen.findByText(/./, { includeHiddenElements: true });
    expect(glyph.props.allowFontScaling).toBe(false);
  });
});
