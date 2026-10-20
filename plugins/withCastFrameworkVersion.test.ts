import {
  CAST_FRAMEWORK_VERSION,
  pinCastFrameworkVersion,
} from "./withCastFrameworkVersion";

// expo/config-plugins pulls in the xcode package, which Jest cannot parse;
// only the build.gradle edit is under test here.
jest.mock("expo/config-plugins", () => ({
  withProjectBuildGradle: (config: unknown) => config,
}));

const pinned = `castFrameworkVersion = "${CAST_FRAMEWORK_VERSION}"`;

describe("pinCastFrameworkVersion", () => {
  // What react-native-google-cast's own plugin leaves in a phone build: "+"
  // let play-services-cast-framework 23.0.0 in, and with it a mediarouter
  // that needs compileSdk 37.
  it("replaces the library plugin's latest-release version", () => {
    const gradle = [
      "buildscript {",
      "  ext {",
      '        castFrameworkVersion = "+"',
      "  }",
      "}",
    ].join("\n");

    expect(pinCastFrameworkVersion(gradle)).toBe(
      ["buildscript {", "  ext {", `        ${pinned}`, "  }", "}"].join("\n"),
    );
  });

  // An Android TV build: the library is linked without its plugin.
  it("adds the version to an ext block that has none", () => {
    const gradle =
      'buildscript {\n  ext {\n    kotlinVersion = "2.1.0"\n  }\n}';

    const result = pinCastFrameworkVersion(gradle);

    expect(result).toContain(pinned);
    expect(result).toContain('kotlinVersion = "2.1.0"');
  });

  it("adds an ext block to a buildscript without one", () => {
    const result = pinCastFrameworkVersion(
      "buildscript {\n  repositories {}\n}",
    );

    expect(result).toMatch(
      /buildscript \{\n {4}ext \{\n {8}castFrameworkVersion/,
    );
  });

  it("sets it on the root project when there is no buildscript", () => {
    expect(pinCastFrameworkVersion("allprojects {}\n")).toBe(
      `allprojects {}\n\next.${pinned}\n`,
    );
  });

  it("gives the same file when run twice", () => {
    const once = pinCastFrameworkVersion("buildscript {\n  ext {\n  }\n}");

    expect(pinCastFrameworkVersion(once)).toBe(once);
  });
});
