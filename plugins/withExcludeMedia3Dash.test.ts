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
});
