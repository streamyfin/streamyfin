import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
  readFileSync(join(__dirname, "..", path), "utf8");
const apple = read("ios/NativePlayer/Views/PlayerCenterControls.swift");
const appleRoot = read("ios/NativePlayer/Views/PlayerControlsRootView.swift");
const appleTV = read("ios/NativePlayer/Views/TV/TVControlsRow.swift");
const appleStatus = read("ios/NativePlayer/Views/TV/TVOverlayLayers.swift");
const androidRoot =
  "android/src/main/java/expo/modules/mpvplayer/nativeplayer/";
const android = read(`${androidRoot}ui/PlayerPlaybackIcon.kt`);
const androidControls = read(`${androidRoot}ui/CenterControls.kt`);
const androidTV = read(`${androidRoot}ui/tv/TvControlsRow.kt`);
const androidStatus = read(`${androidRoot}ui/tv/TvStatusOverlays.kt`);

describe("native SyncPlay visual contract", () => {
  test("Apple preserves the React control icon vocabulary", () => {
    expect(apple).toContain('case schedulePlay = "schedule-play"');
    expect(apple).toContain("case unpause, pause, seek, buffering");
    expect(apple).toContain('case waitPause = "wait-pause"');
    expect(apple).toContain('case waitUnpause = "wait-unpause"');
    expect(apple).toContain(
      'case .schedulePlay: return "arrow.triangle.2.circlepath"',
    );
    expect(apple).toContain('case .unpause: return "play.circle"');
    expect(apple).toContain('case .pause: return "pause.circle"');
    expect(apple).toContain('case .seek: return "arrow.clockwise"');
    expect(apple).toContain(
      'case .buffering, .waitPause, .waitUnpause: return "clock"',
    );
    expect(apple).toContain(
      'case .schedulePlay, .waitUnpause: return "play.fill"',
    );
    expect(apple).toContain('case .waitPause: return "pause.fill"');
  });

  test("rotation only affects the primary symbol, not its status badge", () => {
    expect(apple.indexOf(".rotationEffect(")).toBeLessThan(
      apple.indexOf("if let secondary = action.secondarySymbol"),
    );
    expect(apple).toContain(
      "action == .schedulePlay ? .center : .bottomTrailing",
    );
    expect(android).toContain("rotationZ = rotation.value");
    expect(android).toContain(
      "if (action.centered) Alignment.Center else Alignment.BottomEnd",
    );
  });

  test("iOS loading never hides or disables the visible transport button", () => {
    const transport = apple
      .split("Button {\n\t\t\t\tviewModel.togglePlayPause()", 2)[1]
      ?.split("if hasChapters", 1)[0];
    expect(transport).toBeDefined();
    expect(transport).toContain("PlayerPlaybackIcon(");
    expect(transport).toContain(".contentShape(Rectangle())");
    expect(transport).not.toContain(".opacity(");
    expect(transport).not.toContain(".disabled(");
    expect(appleRoot).toContain(
      "!viewModel.controlsVisible && viewModel.hasPlaybackStatus",
    );
    expect(appleRoot).toMatch(
      /!viewModel.controlsVisible && viewModel.hasPlaybackStatus[\s\S]*?Button \{\s*viewModel.togglePlayPause\(\)/,
    );
  });

  test("Android keeps every icon inside the same clickable button", () => {
    const transport = androidControls
      .split("// Play / Pause main button", 2)[1]
      ?.split("// Seek Forward", 1)[0];
    expect(transport).toBeDefined();
    expect(transport).toContain(".clickable(role = Role.Button)");
    expect(transport).toContain("viewModel.togglePlayPause()");
    expect(transport).toContain("PlayerPlaybackIcon(");
    expect(transport).not.toContain("enabled =");
    expect(android).not.toContain(".clickable");
  });

  test("TV status uses the focusable button when the chrome is shown", () => {
    expect(appleTV).toMatch(
      /viewModel.togglePlayPause\(\)[\s\S]*?PlayerPlaybackIcon\([\s\S]*?\.focused\(\$focusedControl, equals: \.playPause\)/,
    );
    expect(androidTV).toMatch(
      /control = TvControl.PLAY_PAUSE,[\s\S]*?onClick = \{ viewModel.togglePlayPause\(\) \},[\s\S]*?PlayerPlaybackIcon\(/,
    );
    expect(androidTV).toContain("syncPlayColor = LocalContentColor.current");
    expect(appleTV).toContain("syncPlayColor: nil");
    for (const status of [appleStatus, androidStatus]) {
      expect(status).toContain(
        "!viewModel.controlsVisible && viewModel.hasPlaybackStatus",
      );
    }
  });
});
