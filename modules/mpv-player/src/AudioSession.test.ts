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

// Comments quote the code they explain, so the specs that look for a word
// (guard, return, var) read the source without them.
const withoutComments = (source: string) => source.replace(/\/\/.*$/gm, "");

const rendererSource = sourceOf("MPVLayerRenderer.swift");
const engineSource = withoutComments(sourceOf("PlayerEngine.swift"));
const sessionSource = withoutComments(sourceOf("PlayerAudioSession.swift"));

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
  // to reach the session every time, not only the first. The first version of
  // this change remembered that the session "was" applied and lost exactly
  // that, so the specs below cover each place such a shortcut could go: the
  // call in play(), the engine's helper, and PlayerAudioSession itself.
  test("play() asks for the session every time, ahead of the unpause", () => {
    const play = section(engineSource, "\tfunc play() {", "\n\t}\n");

    expect(play).toMatch(
      /^\s*activateAudioSession\(\)\s*resumePlayback\(\)\s*$/,
    );
  });

  // The renderer's load block waits for the requests made so far, so this one
  // has to be queued before the load or mpv opens its audio output against
  // whatever category the last player left behind.
  test("loadVideo() asks for the session before it queues the load", () => {
    const loadVideo = section(engineSource, "\tfunc loadVideo(", "\n\t}\n");

    expect(loadVideo).toMatch(
      /if config\.autoplay \{\s*activateAudioSession\(\)\s*\}\s*renderer\?\.load\(/,
    );
  });

  // A play() or an mpv callback can still arrive once the player has closed.
  // An activation queued behind the teardown would take the session back
  // with no player left to give it up. A shutdown is also the only reason to
  // skip a request: any other condition here is the "already applied" flag
  // again.
  test("a shutdown is the engine's only reason to skip the session", () => {
    expect(engineSource.split("audioSession.activate(")).toHaveLength(2);

    const helper = section(
      engineSource,
      "\tprivate func activateAudioSession(",
      "\n\t}\n",
    );

    expect(helper).toMatch(
      /^[^\n]*\{\s*guard !isShutDown else \{ return \}\s*audioSession\.activate\(completion: completion\)\s*$/,
    );
  });

  test("PlayerAudioSession applies every request it is given", () => {
    // Nothing to remember an earlier activation with.
    expect(sessionSource).not.toMatch(/\bvar\b/);

    const activate = section(sessionSource, "\tfunc activate(", "\n\t}\n");

    // Straight onto the queue, with no way out before the session calls.
    expect(activate).toMatch(/^[^\n]*\{\s*queue\.async \{/);
    expect(activate).not.toMatch(/\b(guard|return)\b/);
    expect(activate).toMatch(
      /try session\.setCategory\([\s\S]*?try session\.setActive\(true\)/,
    );
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
