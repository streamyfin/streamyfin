import { alignMedia3, MEDIA3_VERSION } from "./withExcludeMedia3Dash";

// expo/config-plugins pulls in the xcode package, which Jest cannot parse;
// only the build.gradle edit is under test here.
jest.mock("expo/config-plugins", () => ({
  withAppBuildGradle: (config: unknown) => config,
}));

const appBuildGradle =
  'android {\n}\n\ndependencies {\n  implementation("x")\n}\n';

describe("alignMedia3", () => {
  // react-native-track-player declares Media3 1.10 while the players declare
  // a newer release, and Gradle resolves each artifact on its own: the music
  // queue's media3-session would stay on 1.10 next to a newer ExoPlayer.
  it("resolves every androidx.media3 artifact to the players' release", () => {
    const result = alignMedia3(appBuildGradle);

    expect(result).toContain("details.requested.group == 'androidx.media3'");
    expect(result).toContain(`details.useVersion '${MEDIA3_VERSION}'`);
    expect(result.indexOf("configurations.all")).toBeLessThan(
      result.indexOf("dependencies {"),
    );
  });

  it("still leaves track-player's DASH, SmoothStreaming and RTSP artifacts out", () => {
    const result = alignMedia3(appBuildGradle);

    for (const module of [
      "media3-exoplayer-dash",
      "media3-exoplayer-smoothstreaming",
      "media3-exoplayer-rtsp",
    ]) {
      expect(result).toContain(
        `exclude group: 'androidx.media3', module: '${module}'`,
      );
    }
  });

  it("edits a build file once", () => {
    const once = alignMedia3(appBuildGradle);

    expect(alignMedia3(once)).toBe(once);
  });

  // An android/ folder an earlier prebuild left behind holds the exclusions the plugin wrote
  // then, without the alignment rule: the music queue's media3-session stayed on Expo Audio's
  // release next to the players' newer one.
  it("adds the alignment rule to a build file that only has the earlier exclusions", () => {
    const earlier = appBuildGradle.replace(
      "dependencies {",
      `configurations.all {
    // Exclude duplicate media3 modules to avoid conflict between react-native-video and react-native-track-player
    exclude group: 'androidx.media3', module: 'media3-exoplayer-dash'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-smoothstreaming'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-rtsp'
}

dependencies {`,
    );

    const result = alignMedia3(earlier);

    expect(result).toContain(`details.useVersion '${MEDIA3_VERSION}'`);
    expect(result.split("media3-exoplayer-dash")).toHaveLength(2);
    expect(alignMedia3(result)).toBe(result);
  });

  it("moves an alignment rule written for an earlier release to the current one", () => {
    const earlier = alignMedia3(appBuildGradle).replace(
      `details.useVersion '${MEDIA3_VERSION}'`,
      "details.useVersion '1.9.1'",
    );

    const result = alignMedia3(earlier);

    expect(result).toContain(`details.useVersion '${MEDIA3_VERSION}'`);
    expect(result).not.toContain("1.9.1");
  });
});
