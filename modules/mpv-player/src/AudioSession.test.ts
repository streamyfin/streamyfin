import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The audio session is the shared AVAudioSession, and every call on it is a
// synchronous round trip to the audio server. Made on the main thread those
// calls hung the app for 2 to 8 seconds (Sentry REACT-NATIVE-G7, E0, DZ, J4,
// 3G), so they all live in PlayerAudioSession, on its own queue. Nothing here
// can run the player; what it pins is that the calls stay where they are.
const iosDir = join(__dirname, "../ios");
const swiftSources = (readdirSync(iosDir, { recursive: true }) as string[])
  .filter((file) => file.endsWith(".swift"))
  .map((file) => ({ file, source: readFileSync(join(iosDir, file), "utf8") }));
const sourceOf = (name: string) =>
  swiftSources.find(({ file }) => file === name)?.source ?? "";
const section = (source: string, start: string, end: string) =>
  source.split(start, 2)[1]?.split(end, 1)[0] ?? "";

const rendererSource = sourceOf("MPVLayerRenderer.swift");

describe("iOS audio session", () => {
  test("only PlayerAudioSession changes the session", () => {
    const offenders = swiftSources
      .filter(({ file }) => file !== "PlayerAudioSession.swift")
      .filter(({ source }) => /\.(setActive|setCategory)\(/.test(source))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  // Other audio code in the process shares the session and can deactivate it
  // with no notification: expo-audio does, 100 ms after its last player
  // pauses. Pausing and resuming is what brings the audio back, so play() has
  // to reach the session every time, not only the first.
  test("every activation reaches the session, not only the first", () => {
    const activate = section(
      sourceOf("PlayerAudioSession.swift"),
      "\tfunc activate(",
      "\n\t}\n",
    );

    expect(activate).toMatch(
      /queue\.async \{\s*let session = AVAudioSession\.sharedInstance\(\)\s*do \{\s*try session\.setCategory\([^\n]*\s*try session\.setActive\(true\)/,
    );
  });

  // A play() or an mpv callback can still arrive once the player has closed.
  // An activation queued behind the teardown would take the session back
  // with no player left to give it up.
  test("the engine never asks for the session after a shutdown", () => {
    const requests = sourceOf("PlayerEngine.swift").split(
      "audioSession.activate(",
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatch(/guard !isShutDown else \{ return \}\s*$/);
  });

  test("the session is settled before mpv is told to load", () => {
    const load = section(
      rendererSource,
      "    func load(",
      "    func applyPreset(",
    );

    expect(load).toMatch(/waitForPendingChanges\(\)[\s\S]*"loadfile"/);
  });

  test("the session is settled before mpv is unpaused", () => {
    const play = section(
      rendererSource,
      "    func play() {",
      "    func pausePlayback() {",
    );

    expect(play).toMatch(
      /waitForPendingChanges\(\)[\s\S]*setProperty\(name: "pause", value: "no"\)/,
    );
  });

  test("the route log reads the session off the main thread", () => {
    const logAudioRoute = section(
      rendererSource,
      "    private func logAudioRoute(_ reason: String) {",
      "\n    }\n",
    );

    expect(logAudioRoute.trimStart()).toMatch(
      /^Self\.audioRouteLogQueue\.async \{/,
    );
  });
});
