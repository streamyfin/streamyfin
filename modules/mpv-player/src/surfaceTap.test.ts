import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../ios/NativePlayer/Views/PlayerControlsRootView.swift"),
  "utf8",
);
const tapSurface =
  source
    .split("private func tapSurface(size: CGSize) -> some View {", 2)[1]
    ?.split("\n\tprivate func handleSurfaceTap()", 1)[0] ?? "";
/** What has to hold for the double tap to be composed before the single tap. */
const doubleTapCondition = /if ([\s\S]*?)\{\s*surface\.gesture\(/.exec(
  tapSurface,
)?.[1];

describe("iOS player surface tap", () => {
  test("composes the double tap before the single tap where it can seek", () => {
    expect(doubleTapCondition).toContain("viewModel.doubleTapToSeekEnabled");
    expect(tapSurface).toMatch(
      /SpatialTapGesture\(count: 2\)[\s\S]*\.exclusively\(\s*before: TapGesture\(\)/,
    );
  });

  // doubleTapSeek does nothing on a channel, and composed, every single tap
  // waited out the double-tap window before the chrome toggled.
  test("toggles the chrome at once on a live stream", () => {
    expect(doubleTapCondition).toContain("!viewModel.isLive");
  });
});
