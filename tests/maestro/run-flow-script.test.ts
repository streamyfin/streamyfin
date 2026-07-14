import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const runFlowSource = readFileSync("tests/maestro/run-flow.sh", "utf8");
const runAndroidEmulatorFlowSource = readFileSync(
  "tests/maestro/run-android-emulator-flow.sh",
  "utf8",
);
const androidPlaybackFlowSource = readFileSync(
  "tests/maestro/flows/play-steamboat-willie-authenticated.yaml",
  "utf8",
);
const androidFullPlaybackFlowSource = readFileSync(
  "tests/maestro/flows/play-steamboat-willie.yaml",
  "utf8",
);
const iosSimpleFlowSource = readFileSync(
  "tests/maestro/flows/ios-simple-flow.yaml",
  "utf8",
);
const iosCfFlowSource = readFileSync(
  "tests/maestro/flows/ios-cf-flow.yaml",
  "utf8",
);
const androidSimpleFlowSource = readFileSync(
  "tests/maestro/flows/simple-flow.yaml",
  "utf8",
);
const androidCfFlowSource = readFileSync(
  "tests/maestro/flows/cf-flow.yaml",
  "utf8",
);
const androidCfOpenHeadersFlowSource = readFileSync(
  "tests/maestro/flows/android-cf-open-headers-flow.yaml",
  "utf8",
);
const androidCfSecretFocusFlowSource = readFileSync(
  "tests/maestro/flows/android-cf-secret-focus-flow.yaml",
  "utf8",
);
const androidCfConnectFlowSource = readFileSync(
  "tests/maestro/flows/android-cf-connect-flow.yaml",
  "utf8",
);
const enterServerAndLoginFlowSource = readFileSync(
  "tests/maestro/flows/_enter-server-and-login.yaml",
  "utf8",
);

describe("Maestro run-flow script", () => {
  test("retries Android Maestro driver disconnects without retrying all failures", () => {
    expect(runFlowSource).toContain("maestro_android_driver_unavailable");
    expect(runFlowSource).toContain("StatusRuntimeException: UNAVAILABLE");
    expect(runFlowSource).toContain("Not able to reach the gRPC server");
    expect(runFlowSource).toContain("Command failed \\(tcp:");
    expect(runFlowSource).toContain("retrying %s once");
    expect(runFlowSource).toContain("wait_for_android_device");
  });

  test("preserves Maestro exit status for composite flows", () => {
    expect(runFlowSource).toContain("set +e\n  run_maestro_test");
    expect(runFlowSource).toContain("status=$?\n  set -e");
    expect(runFlowSource).toContain('if [ "$status" -eq 0 ]; then');
    expect(runFlowSource).not.toContain(
      'if run_maestro_test "$platform" "$flow_file"; then',
    );
  });

  test("captures Android playback screenshots after native player transition", () => {
    for (const flowSource of [
      androidPlaybackFlowSource,
      androidFullPlaybackFlowSource,
    ]) {
      expect(flowSource).toContain('text: "Got it"');
      expect(flowSource).not.toContain('id: "maestro-playback-telemetry"');
      expect(flowSource).not.toContain("isPlaying=true");
      expect(flowSource).not.toContain("isLoading=false");
      expect(flowSource.indexOf("play-button")).toBeLessThan(
        flowSource.indexOf('text: "Got it"'),
      );
      expect(flowSource.indexOf('text: "Got it"')).toBeLessThan(
        flowSource.indexOf("09-playing"),
      );
    }
  });

  test("keeps Android foreground checks diagnostic during native playback", () => {
    expect(runAndroidEmulatorFlowSource).toContain(
      "verify_streamyfin_foreground_after_playback",
    );
    expect(runAndroidEmulatorFlowSource).toContain(
      "verify_android_playback_screenshot",
    );
    expect(runAndroidEmulatorFlowSource).toContain("dumpsys window windows");
    expect(runAndroidEmulatorFlowSource).toContain(
      "relying on playback screenshot verifier",
    );
    expect(runAndroidEmulatorFlowSource).toContain(
      "node tests/maestro/verify-ios-playback-artifacts.mjs",
    );
    expect(runAndroidEmulatorFlowSource).toContain("-maxdepth 2");
    expect(runAndroidEmulatorFlowSource).toContain(
      "$artifact_root/*-$" + "{video_slug}/10-playing-5s.png",
    );
    expect(runAndroidEmulatorFlowSource).toContain("10-playing-5s.png");
    expect(runAndroidEmulatorFlowSource).toContain("return 0");
    expect(runAndroidEmulatorFlowSource).toContain("mCurrentFocus");
    expect(runAndroidEmulatorFlowSource).toContain("mFocusedApp");
    expect(runAndroidEmulatorFlowSource).toContain("*steamboat*|cf");
  });

  test("keeps missing Android screenrecord diagnostic while screenshots gate playback", () => {
    expect(runAndroidEmulatorFlowSource).toContain(
      "screenrecord did not produce %s",
    );
    expect(runAndroidEmulatorFlowSource).not.toContain(
      "test_status=1\n  else\n    printf 'warning: screenrecord did not produce",
    );
  });

  test("captures Android logcat around playback failures", () => {
    expect(runAndroidEmulatorFlowSource).toContain(
      "android-logcat-before-flow.log",
    );
    expect(runAndroidEmulatorFlowSource).toContain(
      "android-logcat-after-flow.log",
    );
    expect(runAndroidEmulatorFlowSource).toContain("logcat -c");
    expect(runAndroidEmulatorFlowSource).toContain("logcat -d");
  });

  test("requires rendered video pixels for iOS playback", () => {
    const waitFunction = runFlowSource.slice(
      runFlowSource.indexOf("wait_for_ios_rendered_playback()"),
      runFlowSource.indexOf("open_ios_player_from_detail()"),
    );
    const openFunction = runFlowSource.slice(
      runFlowSource.indexOf("open_ios_player_from_detail()"),
    );

    expect(runFlowSource).toContain("wait_for_ios_rendered_playback");
    expect(runFlowSource).toContain("ios-playback-verifier.log");
    expect(runFlowSource).toContain(
      "node tests/maestro/verify-ios-playback-artifacts.mjs",
    );
    expect(runFlowSource).toContain(
      "iOS playback did not render video content within 90 seconds.",
    );
    expect(runFlowSource).toContain("IOS_SIMCTL_SCREENSHOT_TIMEOUT");
    expect(runFlowSource).toContain("iOS playback screenshot attempt $attempt");
    expect(runFlowSource).toContain("simctl screenshot failed or timed out.");
    expect(runFlowSource).not.toContain("IOS_ALLOW_BLACK_PLAYBACK");
    expect(openFunction.indexOf("11-player-opened.png")).toBeLessThan(
      openFunction.indexOf("wait_for_ios_rendered_playback"),
    );
    expect(
      waitFunction.indexOf("verify-ios-playback-artifacts.mjs"),
    ).toBeLessThan(waitFunction.indexOf("13-playing-10s.png"));
    expect(waitFunction.indexOf("12-playing-5s.png")).toBeLessThan(
      waitFunction.indexOf("13-playing-10s.png"),
    );
  });

  test("uses platform-specific server URL variables for login flows", () => {
    expect(runFlowSource).toContain("MAESTRO_IOS_SERVER_URL");
    expect(runFlowSource).toContain("MAESTRO_IOS_DIRECT_SERVER_URL");
    expect(runFlowSource).toContain("MAESTRO_IOS_CF_SERVER_URL");
    expect(runFlowSource).toContain("MAESTRO_ANDROID_SERVER_URL");
    expect(runFlowSource).toContain("resolve_platform_server_urls");
    expect(runFlowSource).toContain(
      ': "$' +
        "{MAESTRO_IOS_SERVER_URL:=$" +
        "{MAESTRO_IOS_DIRECT_SERVER_URL:-$" +
        '{MAESTRO_SERVER_URL:-}}}"',
    );
    expect(runFlowSource).toContain(
      "MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL",
    );
    expect(runFlowSource).toContain(
      "MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_CF_SERVER_URL",
    );
    expect(runFlowSource).toContain(
      ': "$' + "{MAESTRO_ANDROID_SERVER_URL:=$" + '{MAESTRO_SERVER_URL:-}}"',
    );
    expect(runFlowSource).toContain(
      "MAESTRO_LOGIN_SERVER_URL=$MAESTRO_IOS_SERVER_URL",
    );
    expect(runFlowSource).toContain(
      "MAESTRO_LOGIN_SERVER_URL=$MAESTRO_ANDROID_SERVER_URL",
    );
    expect(runFlowSource).toContain(
      "MAESTRO_LOGIN_SERVER_URL|MAESTRO_USERNAME",
    );
    expect(runFlowSource).toContain("Login URL:");
    expect(iosSimpleFlowSource).toContain(
      'inputText: "$' + '{MAESTRO_LOGIN_SERVER_URL}"',
    );
    expect(iosCfFlowSource).toContain(
      'inputText: "$' + '{MAESTRO_LOGIN_SERVER_URL}"',
    );
    expect(androidSimpleFlowSource).toContain(
      'inputText: "$' + '{MAESTRO_LOGIN_SERVER_URL}"',
    );
    expect(androidCfFlowSource).toContain(
      'inputText: "$' + '{MAESTRO_LOGIN_SERVER_URL}"',
    );
    expect(runFlowSource).toContain("run_android_cf_flow");
    expect(runFlowSource).toContain(
      'adb_input_text "$MAESTRO_CF_ACCESS_CLIENT_ID"',
    );
    expect(runFlowSource).toContain(
      'adb_input_text "$MAESTRO_CF_ACCESS_CLIENT_SECRET"',
    );
    expect(runFlowSource).toContain(
      'run_android_cf_flow "$final_artifact_dir"',
    );
    expect(androidCfOpenHeadersFlowSource).not.toContain("inputText:");
    expect(androidCfSecretFocusFlowSource).not.toContain("inputText:");
    expect(androidCfConnectFlowSource).not.toContain("inputText:");
    expect(androidCfConnectFlowSource).toContain('id: "username-input"');
    expect(enterServerAndLoginFlowSource).toContain(
      'inputText: "$' + '{MAESTRO_LOGIN_SERVER_URL}"',
    );
    expect(enterServerAndLoginFlowSource).not.toContain(
      "MAESTRO_IOS_SERVER_URL",
    );
    expect(enterServerAndLoginFlowSource).not.toContain(
      "MAESTRO_ANDROID_SERVER_URL",
    );
  });

  test("fails fast when iOS is configured with the Android emulator host alias", () => {
    expect(runFlowSource).toContain(
      "iOS selected with Android emulator host URL",
    );
    expect(runFlowSource).toContain("http://localhost:8096");
    expect(runFlowSource).not.toContain(
      "WARNING: Using Android emulator host URL with iOS selected",
    );
  });
});
