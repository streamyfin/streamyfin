import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
const workflowPath = join(
  repoRoot,
  ".github",
  "workflows",
  "maestro-simple-login.yml",
);
const runIosSimulatorFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "run-ios-simulator-flow.sh",
);
const runFlowPath = join(repoRoot, "tests", "maestro", "run-flow.sh");
const recordFlowPath = join(repoRoot, "tests", "maestro", "record-flow.sh");
const iosLaunchFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "_launch-ios.yaml",
);
const connectFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "_connect.yaml",
);
const iosSimpleFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "ios-simple-flow.yaml",
);
const iosCfFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "ios-cf-flow.yaml",
);
const iosPlayAuthenticatedFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "ios-play-steamboat-willie-authenticated.yaml",
);
const iosPlayFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "ios-play-steamboat-willie.yaml",
);
const iosTapPlayButtonFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "ios-tap-play-button.yaml",
);
const iosPlaybackVerifierPath = join(
  repoRoot,
  "tests",
  "maestro",
  "verify-ios-playback-artifacts.mjs",
);
const loginFlowPath = join(
  repoRoot,
  "tests",
  "maestro",
  "flows",
  "_login.yaml",
);
const networkStatusProviderPath = join(
  repoRoot,
  "providers",
  "NetworkStatusProvider.tsx",
);
const discoverMaestroIdsPath = join(
  repoRoot,
  "tests",
  "fixtures",
  "jellyfin",
  "scripts",
  "discover-maestro-ids.mjs",
);
const cfProxyPath = join(
  repoRoot,
  "tests",
  "fixtures",
  "jellyfin",
  "scripts",
  "cloudflare-access-proxy.mjs",
);
const playButtonPath = join(repoRoot, "components", "PlayButton.tsx");
const phoneLoginPath = join(repoRoot, "components", "login", "Login.tsx");
const tvLoginPath = join(repoRoot, "components", "login", "TVLogin.tsx");
const libraryItemCardPath = join(
  repoRoot,
  "components",
  "library",
  "LibraryItemCard.tsx",
);
const libraryScreenPath = join(
  repoRoot,
  "app",
  "(auth)",
  "(tabs)",
  "(libraries)",
  "[libraryId].tsx",
);
const directPlayerPath = join(
  repoRoot,
  "app",
  "(auth)",
  "player",
  "direct-player.tsx",
);
const mpvPlayerTypesPath = join(
  repoRoot,
  "modules",
  "mpv-player",
  "src",
  "MpvPlayer.types.ts",
);
const androidMpvModulePath = join(
  repoRoot,
  "modules",
  "mpv-player",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "mpvplayer",
  "MpvPlayerModule.kt",
);
const androidMpvRendererPath = join(
  repoRoot,
  "modules",
  "mpv-player",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "mpvplayer",
  "MPVLayerRenderer.kt",
);
const secureCredentialsPath = join(repoRoot, "utils", "secureCredentials.ts");
const workflow = readFileSync(workflowPath, "utf8");
const prepareJob = workflow.slice(
  workflow.indexOf("  prepare-maestro-dependencies:"),
  workflow.indexOf("  android-apk-build:"),
);
const androidBuildJob = workflow.slice(
  workflow.indexOf("  android-apk-build:"),
  workflow.indexOf("  android-e2e:"),
);
const androidE2eJob = workflow.slice(
  workflow.indexOf("  android-e2e:"),
  workflow.indexOf("  ios-e2e:"),
);
const iosJob = workflow.slice(workflow.indexOf("  ios-e2e:"));
const runIosSimulatorFlow = readFileSync(runIosSimulatorFlowPath, "utf8");
const runFlow = readFileSync(runFlowPath, "utf8");
const iosAppCacheKey =
  "key: $" +
  "{{ runner.os }}-$" +
  "{{ runner.arch }}-ios-$" +
  "{{ env.IOS_BUILD_CONFIGURATION }}-simulator-app-$" +
  "{{ steps.ios-app-cache-key.outputs.value }}";
const iosDerivedDataCacheKey =
  "key: $" +
  "{{ runner.os }}-$" +
  "{{ runner.arch }}-ios-$" +
  "{{ env.IOS_BUILD_CONFIGURATION }}-derived-data-native-$" +
  "{{ steps.ios-app-cache-key.outputs.native_value }}";
const iosDerivedDataCacheRestorePrefix =
  "$" +
  "{{ runner.os }}-$" +
  "{{ runner.arch }}-ios-$" +
  "{{ env.IOS_BUILD_CONFIGURATION }}-derived-data-native-$" +
  "{{ steps.ios-app-cache-key.outputs.native_value }}";
const iosDerivedDataProgressiveCacheKey = [
  iosDerivedDataCacheKey,
  "$" + "{{ github.run_id }}",
  "$" + "{{ github.run_attempt }}",
].join("-");
const iosNativeProjectCacheKey =
  "key: $" +
  "{{ runner.os }}-$" +
  "{{ runner.arch }}-ios-$" +
  "{{ env.IOS_BUILD_CONFIGURATION }}-native-project-$" +
  "{{ steps.ios-app-cache-key.outputs.native_value }}";
const jellyfinMediaCacheKey =
  "key: $" +
  "{{ runner.os }}-jellyfin-media-$" +
  "{{ hashFiles('tests/fixtures/jellyfin/scripts/download-media.sh') }}";
const iosFailureArtifactTemplate = "ios-failure-" + "$" + "{label}";

describe("Maestro iOS GitHub workflow", () => {
  test("does not duplicate PR runs with feature branch push runs", () => {
    expect(workflow).not.toContain("branches: [feature/maestr-dev]");
  });

  test("runs only Android phone direct and custom-header flows while TV stays separate", () => {
    expect(androidBuildJob).not.toContain("if: $" + "{{ false }}");
    expect(androidE2eJob).not.toContain("if: $" + "{{ false }}");
    expect(androidBuildJob).toContain(
      "if: needs.select-maestro-matrix.outputs.run_android == 'true'",
    );
    expect(androidBuildJob).toContain('EXPO_PUBLIC_MAESTRO_DEBUG: "1"');
    expect(androidE2eJob).toContain(
      "if: needs.select-maestro-matrix.outputs.run_android == 'true'",
    );
    expect(workflow).toContain('"device":"phone"');
    expect(workflow).toContain('"label":"📱 Android phone APK"');
    expect(workflow).toContain('"label":"📱 Android phone simple playback"');
    expect(workflow).toContain('"flow_name":"play-steamboat-willie"');
    expect(workflow).toContain('"label":"📱 Android phone custom headers"');
    expect(workflow).toContain('"flow_name":"cf"');
    expect(workflow).toContain('"api_level":35');
    expect(workflow).not.toContain('"api_level":36');
    expect(workflow).not.toContain('"device":"tv"');
    expect(workflow).not.toContain('"label":"📺 Android TV APK"');
    expect(workflow).not.toContain('"flow_name":"tv-cf"');
    expect(workflow).toContain('"prebuild_command":"bun run prebuild"');
    expect(workflow).not.toContain('"prebuild_command":"bun run prebuild:tv"');
  });

  test("rejects Android launcher or blank playback screenshots", () => {
    const androidFlowName = "$" + "{{ matrix.flow_name }}";

    expect(androidE2eJob).toContain(
      "name: ✅ Verify Android playback screenshot",
    );
    expect(androidE2eJob).toContain(
      `require_artifact "Android playback screenshot" "tests/maestro/artifacts/*-${androidFlowName}/10-playing-5s.png"`,
    );
    expect(androidE2eJob).toContain(
      'node tests/maestro/verify-ios-playback-artifacts.mjs "$android_screenshot"',
    );
    expect(androidE2eJob.indexOf("name: 🚀 Run Maestro flow")).toBeLessThan(
      androidE2eJob.indexOf("name: ✅ Verify Android playback screenshot"),
    );
    expect(
      androidE2eJob.indexOf("name: ✅ Verify Android playback screenshot"),
    ).toBeLessThan(androidE2eJob.indexOf("name: 🧾 Dump Jellyfin logs"));
  });

  test("restores node_modules before Android screenshot verification", () => {
    expect(androidE2eJob).toContain("  needs:");
    expect(androidE2eJob).toContain("      - prepare-maestro-dependencies");
    expect(androidE2eJob).toContain("name: 🟢 Setup Node.js");
    expect(androidE2eJob).toContain('node-version: "24.x"');
    expect(androidE2eJob).toContain("name: 💾 Restore node_modules");
    expect(androidE2eJob).toContain(
      "key: $" +
        "{{ needs.prepare-maestro-dependencies.outputs.node_modules_cache_key }}",
    );
    expect(androidE2eJob.indexOf("name: 💾 Restore node_modules")).toBeLessThan(
      androidE2eJob.indexOf("name: ✅ Verify Android playback screenshot"),
    );
  });

  test("inspects Android playback recordings when GitHub produces one", () => {
    const androidDeviceName = "$" + "{{ matrix.device }}";
    const androidFlowName = "$" + "{{ matrix.flow_name }}";

    expect(androidE2eJob).toContain(
      "name: 🎞️ Inspect Android playback recording",
    );
    expect(androidE2eJob).toContain(
      `recording=$(find tests/maestro/artifacts -type f -path "tests/maestro/artifacts/videos/${androidDeviceName}-${androidFlowName}.mp4" -print -quit)`,
    );
    expect(androidE2eJob).toContain(
      "Android playback recording was not produced; screenshot verifier remains the playback gate.",
    );
    expect(androidE2eJob).toContain("ffprobe -v error");
    expect(androidE2eJob).toContain(
      "Android playback recording was not readable; screenshot verifier remains the playback gate.",
    );
    expect(androidE2eJob).toContain("ffmpeg -y -sseof -8");
    expect(androidE2eJob).toContain(
      "Android playback recording frame could not be extracted; screenshot verifier remains the playback gate.",
    );
    expect(androidE2eJob).toContain(
      'if ! node tests/maestro/verify-ios-playback-artifacts.mjs "$frame"; then',
    );
    expect(androidE2eJob).toContain(
      "Android playback recording frame did not pass visual verification; screenshot verifier remains the playback gate.",
    );
    expect(
      androidE2eJob.indexOf("name: ✅ Verify Android playback screenshot"),
    ).toBeLessThan(
      androidE2eJob.indexOf("name: 🎞️ Inspect Android playback recording"),
    );
    expect(
      androidE2eJob.indexOf("name: 🎞️ Inspect Android playback recording"),
    ).toBeLessThan(androidE2eJob.indexOf("name: 🧾 Dump Jellyfin logs"));
  });

  test("defaults PR and manual debug runs to iOS simple while broader dispatch remains available", () => {
    expect(workflow).toContain("platform_scope:");
    expect(workflow).toContain("default: ios");
    expect(workflow).toContain("flow_scope:");
    expect(workflow).toContain("default: simple");
    expect(workflow).toContain("ios_recording:");
    expect(workflow).toContain(
      "Record iOS simulator playback videos after screenshot verification.",
    );
    expect(workflow).toContain("IOS_RECORDING:");
    expect(workflow).toContain("$" + "{{ inputs.ios_recording || 'false' }}");
    expect(workflow).toContain("PLATFORM_SCOPE:");
    expect(workflow).toContain("$" + "{{ inputs.platform_scope || 'ios' }}");
    expect(workflow).toContain("FLOW_SCOPE:");
    expect(workflow).toContain("$" + "{{ inputs.flow_scope || 'simple' }}");
    expect(workflow).toContain("ios_simple_enabled=true");
    expect(workflow).toContain("ios_complex_enabled=false");
    expect(workflow).toContain("ios_complex_enabled=true");
    expect(workflow).toContain('ios_recording_enabled="$IOS_RECORDING"');
    expect(workflow).toContain("run_android=false");
    expect(workflow).toContain("run_ios=true");
    expect(workflow).toContain("run_android=true");
    expect(workflow).toContain("run_ios=false");
    expect(workflow).toContain(
      "run_android: $" + "{{ steps.matrix.outputs.run_android }}",
    );
    expect(workflow).toContain(
      "run_ios: $" + "{{ steps.matrix.outputs.run_ios }}",
    );
    expect(workflow).toContain(
      "ios_simple_enabled: $" + "{{ steps.matrix.outputs.ios_simple_enabled }}",
    );
    expect(workflow).toContain(
      "ios_complex_enabled: $" +
        "{{ steps.matrix.outputs.ios_complex_enabled }}",
    );
    expect(workflow).toContain(
      "ios_recording_enabled: $" +
        "{{ steps.matrix.outputs.ios_recording_enabled }}",
    );
    expect(prepareJob).toContain(
      "if: needs.select-maestro-matrix.outputs.run_android == 'true' || needs.select-maestro-matrix.outputs.run_ios == 'true'",
    );
    expect(iosJob).toContain(
      "if: needs.select-maestro-matrix.outputs.run_ios == 'true'",
    );
    expect(iosJob).toContain(
      "if: needs.select-maestro-matrix.outputs.ios_simple_enabled == 'true'",
    );
    expect(iosJob).toContain(
      "if: needs.select-maestro-matrix.outputs.ios_simple_enabled == 'true' && needs.select-maestro-matrix.outputs.ios_recording_enabled == 'true'",
    );
    expect(iosJob).toContain(
      "if: needs.select-maestro-matrix.outputs.ios_complex_enabled == 'true'",
    );
    expect(iosJob).toContain(
      "if: needs.select-maestro-matrix.outputs.ios_complex_enabled == 'true' && needs.select-maestro-matrix.outputs.ios_recording_enabled == 'true'",
    );
  });

  test("runs iOS simulator flows on ARM macOS runners only", () => {
    expect(iosJob).toContain("ios-e2e:");
    expect(iosJob).toContain("runs-on: $" + "{{ matrix.ios_macos_runner }}");
    expect(iosJob).toContain(
      "matrix: $" +
        "{{ fromJSON(needs.select-maestro-matrix.outputs.ios_runner_matrix) }}",
    );
    expect(workflow).toContain("ios_runner_matrix:");
    expect(workflow).toContain("IOS_MACOS_RUNNER:");
    expect(workflow).toContain('"ios_macos_runner":"macos-15"');
    expect(workflow).toContain('"ios_macos_runner":"macos-15-xlarge"');
    expect(workflow).not.toContain('"ios_macos_runner":"macos-15-intel"');
    expect(workflow).toContain("ios_macos_runner:");
    expect(workflow).toContain("default: macos-15");
    expect(workflow).toContain("- macos-15");
    expect(workflow).toContain("- macos-15-xlarge");
    expect(workflow).toContain("- arm-all");
    expect(workflow).not.toContain("- macos-15-intel");
    expect(iosJob).toContain("MAESTRO_PLATFORM: ios");
    expect(iosJob).toContain("MAESTRO_TARGET: ios");
    expect(iosJob).toContain("IOS_BUILD_CONFIGURATION: Release");
    expect(iosJob).toContain('EXPO_PUBLIC_MAESTRO_DEBUG: "1"');
    expect(iosJob).toContain(
      "IOS_APP_CACHE_PATH: .ios-simulator-cache/Streamyfin.app",
    );
    expect(iosJob).toContain("IOS_DERIVED_DATA_PATH: .ios-derived-data");
    expect(iosJob).toContain('IOS_METRO_PORT: "8081"');
    expect(iosJob).toContain("name: 🧰 Select Xcode 26");
    expect(iosJob).toContain("-name 'Xcode_26*.app'");
    expect(iosJob).toContain("name: 🏗️ Build/cache iOS simulator app");
    expect(iosJob).toContain(
      "sh tests/maestro/run-ios-simulator-flow.sh build",
    );
    expect(iosJob).toContain("name: 🚀 Run iOS direct playback flow");
    expect(iosJob).toContain(
      "sh tests/maestro/run-ios-simulator-flow.sh simple",
    );
    expect(iosJob).toContain("name: 🎥 Record iOS simple flow");
    expect(iosJob).toContain(
      "sh tests/maestro/run-ios-simulator-flow.sh record",
    );
    expect(iosJob).toContain("name: ☁️ Run iOS CF playback flow");
    expect(iosJob).toContain("sh tests/maestro/run-ios-simulator-flow.sh cf");
    expect(iosJob).toContain("name: 🎥 Record iOS CF playback flow");
    expect(iosJob).toContain(
      "sh tests/maestro/run-ios-simulator-flow.sh cf-record",
    );
    expect(iosJob.indexOf("name: ☁️ Run iOS CF playback flow")).toBeLessThan(
      iosJob.indexOf("name: 🎥 Record iOS simple flow"),
    );
    expect(iosJob.indexOf("name: ✅ Verify iOS CF screenshots")).toBeLessThan(
      iosJob.indexOf("name: 🎥 Record iOS simple flow"),
    );
    expect(iosJob.indexOf("name: 🎥 Record iOS simple flow")).toBeLessThan(
      iosJob.indexOf("name: 🎥 Record iOS CF playback flow"),
    );
    expect(iosJob).not.toContain(
      "sh tests/maestro/run-ios-simulator-flow.sh all",
    );
    expect(iosJob).not.toContain("timeout-minutes: 65");
  });

  test("starts a native Jellyfin fixture without running the Docker fixture URL helper", () => {
    expect(iosJob).toContain("make wait-ready");
    expect(iosJob).toContain(
      "printf 'MAESTRO_SERVER_URL=%s\\n' \"$MAESTRO_SERVER_URL\"",
    );
    expect(iosJob).toContain("make configure-maestro-ids");
    expect(iosJob).toContain('JELLYFIN_URL="http://localhost:8096"');
    expect(iosJob).toContain('MAESTRO_ENV_FILE="../../maestro/.env.local"');
    expect(iosJob).not.toContain("make configure-urls");
  });

  test("uses localhost for the iOS simulator fixture and records host IP as an alternate", () => {
    expect(iosJob).toContain("jellyfin_host_ip=");
    expect(iosJob).toContain(
      "MAESTRO_IOS_DIRECT_SERVER_URL=http://localhost:8096",
    );
    expect(iosJob).toContain(
      "MAESTRO_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL",
    );
    expect(iosJob).toContain(
      "MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL",
    );
    expect(iosJob).toContain(
      "MAESTRO_IOS_HOST_IP_SERVER_URL=http://$jellyfin_host_ip:8096",
    );
    expect(iosJob).toContain(
      "printf 'MAESTRO_IOS_SERVER_URL=%s\\n' \"$MAESTRO_IOS_SERVER_URL\"",
    );
    expect(iosJob).toContain(
      "printf 'MAESTRO_IOS_DIRECT_SERVER_URL=%s\\n' \"$MAESTRO_IOS_DIRECT_SERVER_URL\"",
    );
    expect(iosJob).toContain("Waiting for iOS simulator Jellyfin URL");
  });

  test("forces Maestro playback flows to start from the beginning", () => {
    const playButton = readFileSync(playButtonPath, "utf8");

    expect(playButton).toContain("EXPO_PUBLIC_MAESTRO_DEBUG");
    expect(playButton).toContain("maestroPlaybackPosition");
    expect(playButton).toContain(
      'process.env.EXPO_PUBLIC_MAESTRO_DEBUG === "1" ? "0"',
    );
  });

  test("saves progressive iOS DerivedData caches across timed-out builds", () => {
    expect(iosJob).toContain("name: 💾 Restore iOS DerivedData");
    expect(iosJob).toContain(iosDerivedDataProgressiveCacheKey);
    expect(iosJob).toContain("restore-keys: |");
    expect(iosJob).toContain(`${iosDerivedDataCacheRestorePrefix}-`);
    expect(iosJob).toContain(iosDerivedDataCacheRestorePrefix);
    expect(iosJob).toContain("iOS DerivedData matched key:");
    expect(iosJob).toContain("iOS DerivedData primary key:");
    expect(iosJob).toContain(
      "always() && !cancelled() && steps.ios-app-cache.outputs.cache-hit != 'true' && steps.built-ios-app-cache.outputs.exists != 'true' && steps.built-ios-derived-data-cache.outputs.exists == 'true'",
    );
    expect(iosJob).not.toContain(
      "always() && steps.ios-app-cache.outputs.cache-hit != 'true' && steps.ios-derived-data-cache.outputs.cache-hit != 'true' && steps.built-ios-derived-data-cache.outputs.exists == 'true'",
    );
  });

  test("requires scoped screenshots and movies for the iOS simulator verifier", () => {
    const iosPlaybackVerifier = readFileSync(iosPlaybackVerifierPath, "utf8");

    expect(iosJob).toContain("name: ✅ Verify iOS direct playback screenshot");
    expect(iosJob).toContain(
      'verify_any_artifact "iOS direct playback" "tests/maestro/artifacts/*-ios-play-steamboat-willie/13-playing-10s.png"',
    );
    expect(iosJob).toContain("No %s screenshot showed rendered playback.");
    expect(iosJob).toContain("Verified %s: %s");
    expect(iosJob).toContain("name: ✅ Verify iOS CF screenshots");
    expect(iosJob).toContain(
      'require_artifact "iOS CF login screenshot" "tests/maestro/artifacts/*-ios-cf/04-login-screen.png"',
    );
    expect(iosJob).toContain(
      'verify_any_artifact "iOS CF playback" "tests/maestro/artifacts/*-ios-cf/13-playing-10s.png"',
    );
    expect(iosJob).toContain(
      "node tests/maestro/verify-ios-playback-artifacts.mjs",
    );
    expect(iosPlaybackVerifier).toContain("videoContentRatio");
    expect(iosPlaybackVerifier).toContain("MIN_VIDEO_CONTENT_RATIO");
    expect(iosPlaybackVerifier).toContain(
      "looks black or stuck before video rendered",
    );
    expect(iosJob).not.toContain("IOS_ALLOW_BLACK_PLAYBACK");
    expect(runFlow).not.toContain("IOS_ALLOW_BLACK_PLAYBACK");
    expect(iosJob).toContain("name: ✅ Verify iOS simulator recording");
    expect(iosJob).toContain(
      'recording=$(find tests/maestro/artifacts -type f -path "tests/maestro/artifacts/*-record-direct-playback-simulator-ios/direct-playback-simulator-ios.mov" -print -quit)',
    );
    expect(iosJob).toContain("name: ✅ Verify iOS CF simulator recording");
    expect(iosJob).toContain(
      'recording=$(find tests/maestro/artifacts -type f -path "tests/maestro/artifacts/*-record-cf-playback-simulator-ios/cf-playback-simulator-ios.mov" -print -quit)',
    );
    expect(iosJob).toContain("for second in 70 75 80");
    expect(iosJob).toContain(
      'frame="tests/maestro/artifacts/ios-direct-recording-frame-$' +
        '{second}s.png"',
    );
    expect(iosJob).toContain(
      'frame="tests/maestro/artifacts/ios-cf-recording-frame-$' +
        '{second}s.png"',
    );
    expect(iosJob).toContain('ffmpeg -y -ss "$second" -i "$recording"');
    expect(iosJob).toContain(
      'node tests/maestro/verify-ios-playback-artifacts.mjs "$frame"',
    );
    expect(iosJob).toContain(
      "No sampled iOS direct recording frame showed rendered playback.",
    );
    expect(iosJob).toContain(
      "No sampled iOS CF recording frame showed rendered playback.",
    );
    expect(iosJob).toContain("continue-on-error: true");

    expect(iosJob).toContain("name: maestro-ios-simulator-artifacts");
    expect(iosJob).toContain("path: tests/maestro/artifacts");
    expect(iosJob).toContain("if-no-files-found: error");

    expect(iosJob).toContain("name: maestro-ios-simulator-recordings");
    expect(iosJob).toContain("tests/maestro/artifacts/**/*.mov");
    expect(iosJob).toContain("tests/maestro/artifacts/**/*.mp4");
  });

  test("runs no-header and custom-header iOS playback before recordings", () => {
    const allFlowStart = runIosSimulatorFlow.indexOf("  all)");
    const allFlow = runIosSimulatorFlow.slice(allFlowStart);

    expect(runIosSimulatorFlow).toContain("record_simple_flow()");
    expect(runIosSimulatorFlow).toContain("load_ios_server_urls_from_env_file");
    expect(runIosSimulatorFlow).toContain(
      "MAESTRO_IOS_DIRECT_SERVER_URL|MAESTRO_IOS_CF_SERVER_URL",
    );
    expect(runIosSimulatorFlow).toContain("use_direct_ios_server_url");
    expect(runIosSimulatorFlow).toContain(
      "MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL",
    );
    expect(runIosSimulatorFlow).toContain(
      "record_ios_flow_with_diagnostics direct-playback sh tests/maestro/run-flow.sh ios-play-steamboat-willie",
    );
    expect(runIosSimulatorFlow).toContain("run_ios_playback_flow_with_retry()");
    expect(runIosSimulatorFlow).toContain("IOS_PLAYBACK_FLOW_ATTEMPTS:-2");
    expect(runIosSimulatorFlow).toContain("with a clean app reinstall");
    expect(runIosSimulatorFlow).toContain("else\n      status=$?");
    expect(runIosSimulatorFlow).toContain("record_cf_flow()");
    expect(runIosSimulatorFlow).toContain("use_cf_ios_server_url");
    expect(runIosSimulatorFlow).toContain(
      "MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_CF_SERVER_URL",
    );
    expect(runIosSimulatorFlow).toContain(
      "record_ios_flow_with_diagnostics cf-playback sh tests/maestro/run-flow.sh ios-cf",
    );
    expect(runIosSimulatorFlow).toContain(
      "run_ios_playback_flow_with_retry direct-playback sh tests/maestro/run-flow.sh ios-play-steamboat-willie",
    );
    expect(runIosSimulatorFlow).toContain(
      "run_ios_playback_flow_with_retry cf-playback sh tests/maestro/run-flow.sh ios-cf",
    );
    expect(runFlow).toContain(
      'run_flow ios-play-steamboat-willie-authenticated "$UI_TEST_DIR/flows/ios-play-steamboat-willie-authenticated.yaml"',
    );
    expect(existsSync(connectFlowPath)).toBe(true);
    expect(existsSync(iosPlayFlowPath)).toBe(true);
    expect(runFlow).toContain(
      'run_flow ios-play-steamboat-willie "$UI_TEST_DIR/flows/ios-play-steamboat-willie.yaml"',
    );
    expect(allFlow).toContain("run_simple_flow");
    expect(allFlow).toContain("record_simple_flow");
    expect(allFlow).toContain("run_cf_flow");
    expect(allFlow).toContain("record_cf_flow");
    expect(allFlow.indexOf("run_simple_flow")).toBeLessThan(
      allFlow.indexOf("run_cf_flow"),
    );
    expect(allFlow.indexOf("run_cf_flow")).toBeLessThan(
      allFlow.indexOf("record_simple_flow"),
    );
    expect(allFlow.indexOf("record_simple_flow")).toBeLessThan(
      allFlow.indexOf("record_cf_flow"),
    );
  });

  test("captures iOS playback outside Maestro hierarchy checks", () => {
    const iosPlayAuthenticatedFlow = readFileSync(
      iosPlayAuthenticatedFlowPath,
      "utf8",
    );
    const iosTapPlayButtonFlow = readFileSync(iosTapPlayButtonFlowPath, "utf8");

    expect(iosPlayAuthenticatedFlow).toContain("10-movie-detail");
    expect(iosPlayAuthenticatedFlow).not.toContain("waitToSettleTimeoutMs");
    expect(iosPlayAuthenticatedFlow).not.toContain("11-player-opened");
    expect(iosPlayAuthenticatedFlow).not.toContain("12-playing-5s");
    expect(iosPlayAuthenticatedFlow).not.toContain("13-playing-10s");
    expect(runFlow).toContain("open_ios_player_from_detail()");
    expect(runFlow).not.toContain("streamyfin://player/direct-player?");
    expect(runFlow).not.toContain("xcrun simctl openurl");
    expect(runFlow).toContain(
      'run_maestro_test ios "$UI_TEST_DIR/flows/ios-tap-play-button.yaml"',
    );
    expect(runFlow).not.toContain("ios-close-player.yaml");
    expect(runFlow).not.toContain(
      "Retrying iOS playback render after black/stuck player attempt",
    );
    expect(iosTapPlayButtonFlow).toContain('id: "play-button"');
    expect(iosTapPlayButtonFlow).toContain("waitToSettleTimeoutMs: 0");
    expect(runFlow).toContain("IOS_SIMCTL_SCREENSHOT_TIMEOUT");
    expect(runFlow).toContain("iOS player-opened screenshot");
    expect(runFlow).toContain(
      'opened_screenshot="$artifact_dir/11-player-opened.png"',
    );
    expect(runFlow).not.toContain("11-player-opened-retry-$attempt.png");
    expect(runFlow).toContain(
      'wait_for_ios_rendered_playback "$artifact_dir" "$sim_device"',
    );
    expect(runFlow).toContain(
      "node tests/maestro/verify-ios-playback-artifacts.mjs",
    );
    expect(runFlow).toContain(
      'cp "$screenshot" "$artifact_dir/13-playing-10s.png"',
    );
  });

  test("collects native iOS diagnostics when a playback flow fails", () => {
    expect(runIosSimulatorFlow).toContain("collect_ios_failure_diagnostics()");
    expect(runIosSimulatorFlow).toContain(iosFailureArtifactTemplate);
    expect(runIosSimulatorFlow).toContain("ios-device-streamyfin.log");
    expect(runIosSimulatorFlow).toContain("ios-device-recent.log");
    expect(runIosSimulatorFlow).toContain("final-screen.png");
    expect(runIosSimulatorFlow).toContain("get_app_container");
    expect(runIosSimulatorFlow).toContain("Library/Logs/DiagnosticReports");
    expect(runIosSimulatorFlow).toContain("crash-reports");
    expect(runIosSimulatorFlow).toContain(
      'run_ios_flow_with_diagnostics "$' + "{label}-attempt-$" + '{attempt}"',
    );
    expect(runIosSimulatorFlow).toContain(
      "run_ios_playback_flow_with_retry cf-playback",
    );
  });

  test("caches the built iOS simulator app for faster CI retries", () => {
    const buildAppIndex = iosJob.indexOf(
      "name: 🏗️ Build/cache iOS simulator app",
    );
    const startJellyfinIndex = iosJob.indexOf(
      "name: 🍿 Start native Jellyfin fixture",
    );
    const directFlowIndex = iosJob.indexOf(
      "name: 🚀 Run iOS direct playback flow",
    );

    expect(iosJob).toContain("name: 🔑 Compute iOS app cache key");
    expect(iosJob).toContain("id: ios-app-cache-key");
    expect(iosJob).toContain("native_value=");
    expect(iosJob).toContain("iOS native DerivedData cache key input hash");
    expect(iosJob).toContain("name: 💾 Restore iOS simulator app");
    expect(iosJob).toContain("id: ios-app-cache");
    expect(iosJob).toContain("name: 💾 Restore iOS native project");
    expect(iosJob).toContain("id: ios-native-project-cache");
    expect(iosJob).toContain("name: 💾 Restore iOS DerivedData");
    expect(iosJob).toContain("id: ios-derived-data-cache");
    expect(iosJob).toContain("name: 🔎 Report iOS cache restore state");
    expect(iosJob).toContain("iOS app cache hit:");
    expect(iosJob).toContain("iOS app matched key:");
    expect(iosJob).toContain("iOS app primary key:");
    expect(iosJob).toContain("iOS native project cache hit:");
    expect(iosJob).toContain("iOS native project matched key:");
    expect(iosJob).toContain("iOS native project primary key:");
    expect(iosJob).toContain("iOS DerivedData cache hit:");
    expect(iosJob).toContain("iOS DerivedData matched key:");
    expect(iosJob).toContain("iOS DerivedData primary key:");
    expect(iosJob).toContain("iOS app cache path exists:");
    expect(iosJob).toContain("iOS native project path exists:");
    expect(iosJob).toContain("iOS DerivedData path exists:");
    expect(iosJob).toContain("name: 🔎 Report iOS build output state");
    expect(iosJob).toContain("Recent iOS xcodebuild log tail:");
    expect(iosJob).toContain("iOS DerivedData app candidates:");
    expect(iosJob).toContain("iOS app cache candidate after build:");
    expect(iosJob).toContain("iOS native project cache candidate after build:");
    expect(iosJob).toContain(
      "if: steps.ios-app-cache.outputs.cache-hit != 'true'",
    );
    expect(iosJob).toContain(iosAppCacheKey);
    expect(iosJob).toContain(iosNativeProjectCacheKey);
    expect(iosJob).toContain(iosDerivedDataCacheKey);
    expect(iosJob).toContain("name: 🔎 Check iOS native project cache path");
    expect(iosJob).toContain("id: built-ios-native-project-cache");
    expect(iosJob).toContain("name: 💾 Save iOS native project");
    expect(iosJob).toContain("name: 🔎 Check iOS DerivedData cache path");
    expect(iosJob).toContain("id: built-ios-derived-data-cache");
    expect(iosJob).toContain(
      "if: always() && !cancelled() && steps.ios-app-cache.outputs.cache-hit != 'true'",
    );
    expect(iosJob).toContain("name: 🔎 Check built iOS app cache path");
    expect(iosJob).toContain("id: built-ios-app-cache");
    expect(iosJob).toContain("name: 💾 Save iOS simulator app");
    expect(iosJob).toContain("name: 💾 Save iOS DerivedData");
    expect(iosJob).toContain("actions/cache/save@");
    expect(iosJob).toContain("timeout-minutes: 45");
    expect(buildAppIndex).toBeGreaterThan(-1);
    expect(iosJob.indexOf("name: 💾 Save iOS simulator app")).toBeLessThan(
      iosJob.indexOf("name: 💾 Save iOS DerivedData"),
    );
    expect(
      iosJob.indexOf("name: 🔎 Report iOS build output state"),
    ).toBeGreaterThan(buildAppIndex);
    expect(
      iosJob.indexOf("name: 🔎 Report iOS build output state"),
    ).toBeLessThan(startJellyfinIndex);
    expect(startJellyfinIndex).toBeGreaterThan(buildAppIndex);
    expect(directFlowIndex).toBeGreaterThan(startJellyfinIndex);
    expect(runIosSimulatorFlow).toContain("IOS_APP_CACHE_PATH");
    expect(runIosSimulatorFlow).toContain("IOS_DERIVED_DATA_PATH");
    expect(runIosSimulatorFlow).toContain("ONLY_ACTIVE_ARCH=YES");
    expect(runIosSimulatorFlow).toContain('ARCHS="$host_arch"');
    expect(runIosSimulatorFlow).toContain("Arch settings:");
    expect(runIosSimulatorFlow).toContain("Using cached iOS app");
    expect(runIosSimulatorFlow).toContain("Saved iOS app cache candidate");
    expect(runIosSimulatorFlow).toContain("IOS_SIMCTL_INSTALL_TIMEOUT");
    expect(runIosSimulatorFlow).toContain("run_with_timeout()");
    expect(runIosSimulatorFlow).toContain(
      '"simctl install iOS app" xcrun simctl install "$MAESTRO_DEVICE" "$ios_app_path"',
    );
    expect(runIosSimulatorFlow).toContain(
      '"simctl reinstall iOS app" xcrun simctl install "$MAESTRO_DEVICE" "$ios_app_path"',
    );
    expect(runIosSimulatorFlow).toContain(
      "collect_ios_failure_diagnostics install",
    );
    expect(runIosSimulatorFlow).toContain(
      "collect_ios_failure_diagnostics reinstall",
    );
    expect(iosJob).toContain("maestro_debug=%s\\n");
    expect(runIosSimulatorFlow).toContain(
      "all|build|simple|cf|record|cf-record",
    );
    expect(runIosSimulatorFlow).toContain("  build)");
  });

  test("prepares ignored Jellyfin fixture media before starting native iOS Jellyfin", () => {
    const cacheMediaIndex = iosJob.indexOf(
      "name: 💾 Cache Jellyfin fixture media",
    );
    const prepareMediaIndex = iosJob.indexOf(
      "name: 🎞️ Prepare Jellyfin fixture media",
    );
    const startJellyfinIndex = iosJob.indexOf(
      "name: 🍿 Start native Jellyfin fixture",
    );

    expect(iosJob).toContain("path: tests/fixtures/jellyfin/media");
    expect(iosJob).toContain(jellyfinMediaCacheKey);
    expect(iosJob).toContain("brew install ffmpeg");
    expect(iosJob).toContain("run: make jellyfin-download-media");
    expect(cacheMediaIndex).toBeGreaterThan(-1);
    expect(prepareMediaIndex).toBeGreaterThan(cacheMediaIndex);
    expect(startJellyfinIndex).toBeGreaterThan(prepareMediaIndex);
  });

  test("runs the available phone prebuild command before the iOS simulator build", () => {
    expect(runIosSimulatorFlow).not.toContain("make ensure-prebuild-phone");
    expect(runIosSimulatorFlow).toContain("bun run prebuild");
  });

  test("keeps dev-client support but uses Release in the temporary iOS MVP workflow", () => {
    const iosLaunchFlow = readFileSync(iosLaunchFlowPath, "utf8");
    const iosSimpleFlow = readFileSync(iosSimpleFlowPath, "utf8");
    const iosCfFlow = readFileSync(iosCfFlowPath, "utf8");

    expect(runIosSimulatorFlow).toContain("MAESTRO_EXPO_DEV_CLIENT_URL");
    expect(runIosSimulatorFlow).toContain(
      "exp+streamyfin://expo-development-client/",
    );
    expect(runIosSimulatorFlow).toContain("IOS_METRO_HOST");
    expect(runIosSimulatorFlow).toContain("REACT_NATIVE_PACKAGER_HOSTNAME");
    expect(runIosSimulatorFlow).toContain("RCT_jsLocation");
    expect(runIosSimulatorFlow).toContain("configure_ios_permissions");
    expect(runIosSimulatorFlow).toContain(
      'simctl privacy "$MAESTRO_DEVICE" revoke notifications "$MAESTRO_APP_ID"',
    );
    expect(runIosSimulatorFlow).toContain("xcrun simctl openurl");
    expect(runIosSimulatorFlow).toContain(
      "Launching app id before Expo dev-client URL",
    );
    expect(runIosSimulatorFlow).toContain(
      'if [ "$ios_build_configuration" != "Release" ]; then',
    );
    expect(iosJob).not.toContain("Opening Expo dev-client URL");
    expect(runIosSimulatorFlow).toContain("prepare_ios_app_for_flow");
    expect(runFlow).toContain("MAESTRO_EXPO_DEV_CLIENT_URL");
    expect(runFlow).toContain("MAESTRO_USERNAME MAESTRO_EXPO_DEV_CLIENT_URL");
    expect(iosLaunchFlow).not.toContain("clearState");
    expect(iosLaunchFlow).not.toContain("launchApp");
    expect(iosLaunchFlow).not.toContain("openLink");
    expect(iosLaunchFlow).toContain('visible: "Open"');
    expect(iosLaunchFlow).toContain('tapOn: "Open"');
    expect(iosLaunchFlow).toContain('visible: "Allow"');
    expect(iosLaunchFlow).toContain('tapOn: "Allow"');
    expect(iosLaunchFlow).toContain('point: "33%,59%"');
    expect(iosLaunchFlow).toContain("timeout: 180000");
    expect(iosSimpleFlow).toContain("runFlow: _launch-ios.yaml");
    expect(iosCfFlow).toContain("runFlow: _launch-ios.yaml");
  });

  test("keeps custom headers enabled through iOS CF login and playback", () => {
    const phoneLogin = readFileSync(phoneLoginPath, "utf8");
    const iosCfFlow = readFileSync(iosCfFlowPath, "utf8");
    const iosPlayAuthenticatedFlow = readFileSync(
      iosPlayAuthenticatedFlowPath,
      "utf8",
    );
    const enteredScreenshotIndex = iosCfFlow.indexOf(
      "03-cloudflare-headers-entered",
    );
    const firstHeaderValueIndex = iosCfFlow.indexOf(
      'id: "header-value-CF-Access-Client-Id"',
    );
    const secondHeaderValueIndex = iosCfFlow.indexOf(
      'id: "header-value-CF-Access-Client-Secret"',
    );
    const connectIndex = iosCfFlow.indexOf("runFlow: _connect.yaml");

    expect(iosCfFlow).toContain('id: "header-preset-cloudflare"');
    expect(phoneLogin).toContain("testID='server-url-input'");
    expect(phoneLogin).toContain("testID='connect-button'");
    expect(phoneLogin).toContain("testID='advanced-custom-headers'");
    expect(phoneLogin).toMatch(/testID=\{`header-preset-\$\{preset\.id\}`\}/);
    expect(phoneLogin).toMatch(/`header-value-\$\{header\.key\}`/);
    expect(phoneLogin).toContain("testID='username-input'");
    expect(phoneLogin).toContain("testID='password-input'");
    expect(phoneLogin).toContain("testID='login-button'");
    expect(firstHeaderValueIndex).toBeGreaterThan(-1);
    expect(secondHeaderValueIndex).toBeGreaterThan(firstHeaderValueIndex);
    expect(
      iosCfFlow.indexOf("- pressKey: Enter", firstHeaderValueIndex),
    ).toBeLessThan(secondHeaderValueIndex);
    expect(
      iosCfFlow.indexOf("- pressKey: Enter", secondHeaderValueIndex),
    ).toBeLessThan(enteredScreenshotIndex);
    expect(enteredScreenshotIndex).toBeGreaterThan(-1);
    expect(connectIndex).toBeGreaterThan(enteredScreenshotIndex);
    expect(iosCfFlow.indexOf("waitForAnimationToEnd")).toBeLessThan(
      connectIndex,
    );
    expect(iosCfFlow).not.toContain('id: "clear-custom-headers-button"');
    expect(iosCfFlow).toContain("06-home");
    expect(iosCfFlow).not.toContain(
      "runFlow: ios-play-steamboat-willie-authenticated.yaml",
    );
    expect(runFlow).toContain(
      'run_flow ios-play-steamboat-willie-authenticated "$UI_TEST_DIR/flows/ios-play-steamboat-willie-authenticated.yaml" "$final_artifact_dir"',
    );
    expect(iosJob).toContain(
      "MAESTRO_CF_ACCESS_CLIENT_ID: fakecloudflaretoken",
    );
    expect(iosJob).toContain(
      "MAESTRO_CF_ACCESS_CLIENT_SECRET: fakecloudflaresecret",
    );
    expect(iosPlayAuthenticatedFlow).toContain('id: "play-button"');
    expect(iosPlayAuthenticatedFlow).not.toContain('point: "44%,71%"');
    expect(iosPlayAuthenticatedFlow).not.toContain("waitToSettleTimeoutMs");
    expect(iosPlayAuthenticatedFlow).not.toContain('visible: "0m 0s"');
    expect(runFlow).toContain("11-player-opened");
    expect(runFlow).toContain("12-playing-5s");
    expect(runFlow).toContain("13-playing-10s");
    expect(runFlow).toContain(
      "MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET MAESTRO_MOVIES_LIBRARY_ID MAESTRO_STEAMBOAT_WILLIE_ID",
    );
    const playButton = readFileSync(playButtonPath, "utf8");
    const itemContent = readFileSync(
      join(repoRoot, "components", "ItemContent.tsx"),
      "utf8",
    );

    expect(playButton).toContain("testID={testID}");
    expect(itemContent).toContain("testID='play-button'");
  });

  test("exposes deterministic library item selectors for iOS playback flows", () => {
    const libraryItemCard = readFileSync(libraryItemCardPath, "utf8");
    const libraryScreen = readFileSync(libraryScreenPath, "utf8");
    const iosPlayAuthenticatedFlow = readFileSync(
      iosPlayAuthenticatedFlowPath,
      "utf8",
    );

    expect(libraryItemCard).toContain("`library-item-$" + "{library.Id}`");
    expect(libraryItemCard).toContain("testID={libraryTestID}");
    expect(libraryScreen).toContain("`media-item-$" + "{item.Id}`");
    expect(iosPlayAuthenticatedFlow).toContain(
      'id: "$' + '{MAESTRO_MOVIES_LIBRARY_ID}"',
    );
    expect(iosPlayAuthenticatedFlow).toContain(
      'id: "$' + '{MAESTRO_STEAMBOAT_WILLIE_ID}"',
    );
    expect(runFlow).toContain("MAESTRO_MOVIES_LIBRARY_ID");
    expect(runFlow).toContain("MAESTRO_STEAMBOAT_WILLIE_ID");
  });

  test("exposes test-only playback telemetry without requiring iOS hierarchy during playback", () => {
    const directPlayer = readFileSync(directPlayerPath, "utf8");
    const iosPlayAuthenticatedFlow = readFileSync(
      iosPlayAuthenticatedFlowPath,
      "utf8",
    );

    expect(directPlayer).toContain("EXPO_PUBLIC_MAESTRO_DEBUG");
    expect(directPlayer).toContain("maestro-playback-telemetry");
    expect(directPlayer).toContain("isPlaying=");
    expect(directPlayer).toContain("isLoading=");
    expect(directPlayer).toContain("position=");
    expect(directPlayer).toContain("progress=");
    expect(directPlayer).toContain("forceVideoTranscoding:");
    expect(directPlayer).toContain("allowVideoStreamCopy:");
    expect(directPlayer).toContain("allowAudioStreamCopy:");
    expect(directPlayer).toContain('Platform.OS === "ios" ? false');
    expect(directPlayer).toContain('Platform.OS === "ios"');
    expect(directPlayer).toContain("hwdec:");
    expect(directPlayer).toContain('Platform.OS === "android" ? "no"');
    expect(iosPlayAuthenticatedFlow).not.toContain(
      'id: "maestro-playback-telemetry"',
    );
    expect(iosPlayAuthenticatedFlow).not.toContain("isPlaying=true");
    expect(iosPlayAuthenticatedFlow).not.toContain("isLoading=false");
  });

  test("disables Android mpv hardware decoding only for Maestro debug playback", () => {
    const directPlayer = readFileSync(directPlayerPath, "utf8");
    const mpvTypes = readFileSync(mpvPlayerTypesPath, "utf8");
    const androidModule = readFileSync(androidMpvModulePath, "utf8");
    const androidRenderer = readFileSync(androidMpvRendererPath, "utf8");

    expect(directPlayer).toContain(
      'hwdec: IS_MAESTRO_DEBUG && Platform.OS === "android" ? "no" : undefined',
    );
    expect(mpvTypes).toContain(
      'hwdec?: "mediacodec" | "mediacodec-copy" | "no"',
    );
    expect(androidModule).toContain('hwdec = source["hwdec"] as? String');
    expect(androidRenderer).toContain(
      'fun start(voDriver: String = "gpu-next", hwdec: String? = null)',
    );
    expect(androidRenderer).toContain('isEmulator() -> "no"');
    expect(androidRenderer).toContain('isTV -> "mediacodec"');
    expect(androidRenderer).toContain('else -> "mediacodec-copy"');
    expect(androidRenderer).toContain(
      'mpv?.setOptionString("hwdec", hwdecMode)',
    );
  });

  test("guards malformed native progress events in release playback", () => {
    const directPlayer = readFileSync(directPlayerPath, "utf8");

    expect(directPlayer).toContain("data?.nativeEvent");
    expect(directPlayer).toContain("if (!nativeEvent) return");
    expect(directPlayer).toContain("nativeEvent.progress");
  });

  test("records iOS playback flows instead of login-only flows", () => {
    const runIosSimulatorFlow = readFileSync(runIosSimulatorFlowPath, "utf8");

    expect(runIosSimulatorFlow).toContain("record_ios_flow_with_diagnostics");
    expect(runIosSimulatorFlow).toContain(
      "sh tests/maestro/run-flow.sh ios-play-steamboat-willie",
    );
    expect(runIosSimulatorFlow).toContain(
      "sh tests/maestro/run-flow.sh ios-cf",
    );
    expect(runIosSimulatorFlow).not.toContain(
      "sh tests/maestro/record-flow.sh simple simulator ios",
    );
  });

  test("keeps iOS custom-header connect off synchronous SecureStore fallback", () => {
    const secureCredentials = readFileSync(secureCredentialsPath, "utf8");
    const connectionHelperStart = secureCredentials.indexOf(
      "export async function updateServerCustomHeadersForConnection",
    );
    const connectionHelperEnd = secureCredentials.indexOf(
      "\n}\n\n/**\n * Get custom headers for a server.",
      connectionHelperStart,
    );
    const connectionHelper = secureCredentials.slice(
      connectionHelperStart,
      connectionHelperEnd,
    );

    expect(secureCredentials).toContain(
      "function updateServerCustomHeadersWithoutSecureStore",
    );
    expect(connectionHelper).toContain(
      "updateServerCustomHeadersWithoutSecureStore(serverUrl, headers)",
    );
    expect(connectionHelper).not.toContain("updateServerCustomHeadersAsync");
    expect(connectionHelper).not.toContain(
      "updateServerCustomHeaders(serverUrl, headers)",
    );
    expect(secureCredentials).toContain(
      "void updateServerCustomHeadersAsync(serverUrl, customHeaders)",
    );
  });

  test("routes the iOS CF flow through a header-gating proxy", () => {
    const cfProxy = readFileSync(cfProxyPath, "utf8");
    const cfProxyStartIndex = iosJob.indexOf(
      "name: ☁️ Start iOS CF header proxy",
    );
    const cfFlowIndex = iosJob.indexOf("name: ☁️ Run iOS CF playback flow");
    const uploadIndex = iosJob.indexOf(
      "name: 📤 Upload iOS simulator artifacts",
    );
    const stopIndex = iosJob.indexOf("name: 🧹 Stop native Jellyfin fixture");

    expect(cfProxyStartIndex).toBeGreaterThan(-1);
    expect(cfFlowIndex).toBeGreaterThan(cfProxyStartIndex);
    expect(uploadIndex).toBeGreaterThan(cfFlowIndex);
    expect(stopIndex).toBeGreaterThan(uploadIndex);
    expect(iosJob).toContain("JELLYFIN_CF_PROXY_PORT=18096");
    expect(iosJob).toContain(
      "node tests/fixtures/jellyfin/scripts/cloudflare-access-proxy.mjs",
    );
    expect(iosJob).toContain(
      "cf-access-client-id: $MAESTRO_CF_ACCESS_CLIENT_ID",
    );
    expect(iosJob).toContain(
      "cf-access-client-secret: $MAESTRO_CF_ACCESS_CLIENT_SECRET",
    );
    expect(iosJob).toContain('awk -v url="$MAESTRO_SERVER_URL"');
    expect(iosJob).toContain('print "MAESTRO_SERVER_URL=" url');
    expect(iosJob).toContain('mv "$tmp_env" tests/maestro/.env.local');
    expect(iosJob).toContain("cf-proxy.log");
    expect(iosJob).toContain("cf-proxy.pid");
    expect(cfProxy).toContain("cf-access-client-id");
    expect(cfProxy).toContain("cf-access-client-secret");
    expect(cfProxy).toContain("Missing or invalid Cloudflare Access headers");
    expect(cfProxy).toContain("import https from");
    expect(cfProxy).toContain("request.pipe(upstreamRequest)");
    expect(cfProxy).toContain("upstreamResponse.pipe(response)");
    expect(cfProxy).not.toContain("await upstreamResponse.arrayBuffer()");
    expect(cfProxy).toContain("validateTarget(target)");
    expect(cfProxy).toContain("isAllowedTargetHost");
    expect(cfProxy).toContain(
      'throw new Error("Proxy request URL must be relative")',
    );
    expect(cfProxy).toContain(
      "const upstreamUrl = resolveUpstreamUrl(request.url)",
    );
    expect(cfProxy).not.toContain('new URL(request.url ?? "/", target)');
  });

  test("does not overwrite server URLs loaded from the Maestro env file", () => {
    const envUrlMarker =
      "MAESTRO_SERVER_URL_WAS_SET=$" + "{MAESTRO_SERVER_URL+x}";

    for (const script of [runFlow, readFileSync(recordFlowPath, "utf8")]) {
      const envLoadIndex = script.indexOf("load_env_file");
      const envUrlMarkerIndex = script.indexOf(envUrlMarker, envLoadIndex);
      const resolveIndex = script.indexOf(
        "\nresolve_server_url\n",
        envUrlMarkerIndex,
      );

      expect(envLoadIndex).toBeGreaterThan(-1);
      expect(envUrlMarkerIndex).toBeGreaterThan(envLoadIndex);
      expect(resolveIndex).toBeGreaterThan(envUrlMarkerIndex);
    }
  });

  test("uses native fetch semantics for custom-header login server checks", () => {
    for (const loginSourcePath of [phoneLoginPath, tvLoginPath]) {
      const loginSource = readFileSync(loginSourcePath, "utf8");

      expect(loginSource).toContain("normalizeCustomHeaders(source)");
      expect(loginSource).toContain("headersToInject");
      expect(loginSource).toContain("/System/Info/Public");
      expect(loginSource).toContain("updateServerCustomHeadersForConnection");
      expect(loginSource).not.toContain("updateServerCustomHeaders(");
      expect(loginSource).toContain('mode: "cors"');
    }

    const phoneLogin = readFileSync(phoneLoginPath, "utf8");
    expect(phoneLogin).toContain(
      "url.match(/^(https?):\\/\\//i)?.[1]?.toLowerCase()",
    );
    expect(phoneLogin).toContain("explicitProtocol");
    expect(phoneLogin).toContain("? [explicitProtocol]");
    expect(phoneLogin).toContain('baseUrl.startsWith("localhost")');
    expect(phoneLogin).toContain('? ["http", "https"]');

    const tvLogin = readFileSync(tvLoginPath, "utf8");
    expect(tvLogin).toContain('const protocols = ["https", "http"]');
  });

  test("fails iOS login if the post-login home screen cannot reach the server", () => {
    const loginFlow = readFileSync(loginFlowPath, "utf8");
    const networkStatusProvider = readFileSync(
      networkStatusProviderPath,
      "utf8",
    );

    expect(loginFlow).toContain('assertNotVisible: "Server Unreachable"');
    expect(loginFlow).toContain(
      'assertNotVisible: "Could not reach the server"',
    );
    expect(networkStatusProvider).toContain("/System/Info/Public");
    expect(networkStatusProvider).toContain('method: "GET"');
    expect(networkStatusProvider).not.toContain('method: "HEAD"');
  });

  test("retries native Jellyfin ID discovery during startup", () => {
    const discoverMaestroIds = readFileSync(discoverMaestroIdsPath, "utf8");

    expect(discoverMaestroIds).toContain("JELLYFIN_DISCOVERY_RETRIES");
    expect(discoverMaestroIds).toContain("retrying");
    expect(discoverMaestroIds).toContain("error.status = response.status");
  });
});
