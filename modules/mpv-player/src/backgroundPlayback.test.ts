import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
  readFileSync(join(__dirname, "../ios", path), "utf8");
const engine = read("PlayerEngine.swift");
const embeddedHost = read("MpvPlayerView.swift");
const viewModule = read("MpvPlayerModule.swift");
const _nowPlaying = read("MPVNowPlayingManager.swift");
const _nativeSession = read("NativePlayer/NativePlayerSession.swift");

const section = (source: string, start: string, end: string) =>
  source.split(start, 2)[1]?.split(end, 1)[0] ?? "";

/**
 * The subtitle preview is an embedded view showing a silent clip. As a player
 * for the user's media it activated the playback audio session, which stopped
 * their music, and armed automatic picture in picture, which opened the clip
 * when they left the app. Seen on an iPhone.
 */
describe("iOS background playback", () => {
  it("keeps it off in the embedded view until the prop turns it on", () => {
    expect(embeddedHost).toContain("engine.backgroundPlayback = false");
    expect(viewModule).toMatch(
      /Prop\("backgroundPlayback"\)[\s\S]*?view\.setBackgroundPlayback\(enabled \?\? false\)/,
    );
  });

  // Props apply in no fixed order: a source loaded before backgroundPlayback
  // arrived took the session anyway.
  it("loads the source once every prop of the update is in", () => {
    expect(
      section(viewModule, 'Prop("source")', 'Prop("backgroundPlayback")'),
    ).toContain("view.setPendingLoad(config)");
    expect(viewModule).toMatch(
      /OnViewDidUpdateProps \{ \(view: MpvPlayerView\) in\s+view\.loadPendingVideo\(\)/,
    );
  });

  it("takes the audio session and the remote commands only with it", () => {
    expect(
      section(
        engine,
        "private func activateAudioSession(",
        "private func applyBackgroundPlayback",
      ),
    ).toContain("guard backgroundPlayback else {");
    expect(
      section(
        engine,
        "private func setupRemoteCommands()",
        "nowPlayingManager.setupRemoteCommands(",
      ),
    ).toContain("guard backgroundPlayback else { return }");
  });

  it("arms automatic picture in picture only with it", () => {
    expect(
      section(
        engine,
        "func loadVideo(config: VideoLoadConfig",
        "let preset = PlayerPreset(",
      ),
    ).toContain("setPictureInPictureAutoStartEnabled(backgroundPlayback)");
    expect(engine).not.toContain("setPictureInPictureAutoStartEnabled(true)");
  });
});
