import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

// The rules themselves are plain Swift, so they run for real wherever there is
// a Swift compiler: a Mac. The Linux CI runners have none and skip this.
const hasSwift =
  process.platform === "darwin" &&
  spawnSync("swiftc", ["--version"]).status === 0;

(hasSwift ? describe : describe.skip)("AudioSessionState", () => {
  test("passes its Swift unit tests", () => {
    const outDir = mkdtempSync(join(tmpdir(), "audio-session-state-"));
    const binary = join(outDir, "tests");
    try {
      execFileSync("swiftc", [
        join(iosDir, "AudioSessionState.swift"),
        join(__dirname, "../ios-tests/AudioSessionStateTests.swift"),
        "-o",
        binary,
      ]);
      const result = spawnSync(binary, { encoding: "utf8" });

      expect(result.stdout).not.toContain("FAIL");
      expect(result.status).toBe(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
