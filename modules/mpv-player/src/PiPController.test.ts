import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../ios/PiPController.swift"),
  "utf8",
);
const engineSource = readFileSync(
  join(__dirname, "../ios/PlayerEngine.swift"),
  "utf8",
);
const rendererSource = readFileSync(
  join(__dirname, "../ios/MPVLayerRenderer.swift"),
  "utf8",
);
const embeddedHostSource = readFileSync(
  join(__dirname, "../ios/MpvPlayerView.swift"),
  "utf8",
);
const nativeHostSource = readFileSync(
  join(__dirname, "../ios/NativePlayer/NativePlayerViewController.swift"),
  "utf8",
);
const engineInitializer =
  engineSource
    .split("override init() {", 2)[1]
    ?.split(
      "\n\t#if os(iOS)\n\t@objc private func handleDidBecomeActive",
      1,
    )[0] ?? "";
const methodSection = (start: string, end: string) =>
  engineSource.split(start, 2)[1]?.split(end, 1)[0] ?? "";
const playbackRestartMethod = methodSection(
  "func rendererPlaybackDidRestart(",
  "\n\tfunc rendererDidReachEnd(",
);
const manualStartMethod = methodSection(
  "func startPictureInPicture()",
  "\n\tfunc stopPictureInPicture()",
);

describe("iOS automatic PiP lifecycle", () => {
  test("keeps automatic PiP enabled while AVKit prepares the source", () => {
    expect(source).toMatch(
      /func setAutoStartEnabled\(_ enabled: Bool\)[\s\S]*canStartPictureInPictureAutomaticallyFromInline = enabled/,
    );
  });

  test("creates the controller only after the first rendered frame", () => {
    expect(engineInitializer).toContain("renderer = MPVLayerRenderer");
    expect(engineInitializer).not.toMatch(
      /PiPController\(\s*sampleBufferDisplayLayer:/,
    );
    expect(rendererSource).toContain(
      "func rendererPlaybackDidRestart(_ renderer: MPVLayerRenderer, loadGeneration: UInt)",
    );
    expect(rendererSource).toMatch(
      /case MPV_EVENT_PLAYBACK_RESTART:[\s\S]*rendererPlaybackDidRestart/,
    );
    expect(engineSource).toMatch(
      /func rendererPlaybackDidRestart[\s\S]*hasRenderedFirstFrame = true[\s\S]*reconcilePictureInPictureState\(\)/,
    );
    expect(engineSource).toMatch(
      /private func reconcilePictureInPictureState[\s\S]*isPictureInPictureHostVisible[\s\S]*pictureInPictureAutoStartEnabled[\s\S]*hasRenderedFirstFrame[\s\S]*PiPController\(/,
    );
    expect(source).toMatch(
      /init\([\s\S]*delegate: PiPControllerDelegate[\s\S]*self\.delegate = delegate[\s\S]*setupPictureInPicture\(\)/,
    );
    expect(embeddedHostSource).toMatch(
      /override func didMoveToWindow\(\)[\s\S]*setPictureInPictureHostVisible\(window != nil\)/,
    );
    expect(nativeHostSource).toMatch(
      /override func viewDidAppear\(_ animated: Bool\)[\s\S]*setPictureInPictureHostVisible\(true\)/,
    );
  });

  test("has no readiness polling or re-arm workaround", () => {
    expect(source).not.toContain("pictureInPicturePossibleObservation");
    expect(source).not.toContain("refreshAutoStartEligibility");
    expect(engineSource).not.toContain("isPlaybackReadyForPictureInPicture");
    expect(rendererSource).not.toContain("hasReportedFirstFrame");
  });

  test("rejects readiness from older loads without disabling manual PiP", () => {
    expect(rendererSource).toMatch(
      /case MPV_EVENT_START_FILE:[\s\S]*activeLoadGeneration = pendingLoadGenerations\.removeFirst\(\)/,
    );
    expect(playbackRestartMethod).toMatch(
      /loadGeneration: UInt[\s\S]*guard loadGeneration == self\.loadGeneration/,
    );
    expect(manualStartMethod).toMatch(
      /guard isPictureInPictureHostVisible, hasRenderedFirstFrame/,
    );
    expect(manualStartMethod).toContain(
      "reconcilePictureInPictureState(allowManualStart: true)",
    );
    expect(engineSource).toMatch(
      /pictureInPictureAutoStartEnabled \|\| allowManualStart/,
    );
  });
});
