import { readFileSync } from "node:fs";
import { join } from "node:path";

const rendererSource = readFileSync(
  join(__dirname, "../ios/MPVLayerRenderer.swift"),
  "utf8",
);
const propertyCase = (name: string, next: string) =>
  rendererSource
    .split(`case "${name}":`, 2)[1]
    ?.split(`case "${next}":`, 1)[0] ?? "";
const durationCase = propertyCase("duration", "time-pos");

// Android: LiveStreamTest drives the renderer itself.
describe("iOS renderer position ticks on a live stream", () => {
  test("keeps whether the loaded file is live, on the renderer's queue", () => {
    expect(rendererSource).toMatch(
      /queue\.async \{ \[weak self\] in[\s\S]*self\.currentIsLive = isLive[\s\S]*guard let handle = self\.mpv else \{ return \}/,
    );
  });

  // mpv gives as a live stream's duration how far it has read, which moves
  // many times a second: each value went to JS as a full position tick.
  test("sends no tick for a live stream's growing duration", () => {
    expect(durationCase).toMatch(
      /cachedDuration = value[\s\S]*guard !currentIsLive else \{ break \}[\s\S]*didUpdatePosition/,
    );
  });

  test("still ticks when a film's duration is known", () => {
    expect(durationCase).toContain("didUpdatePosition");
  });
});
