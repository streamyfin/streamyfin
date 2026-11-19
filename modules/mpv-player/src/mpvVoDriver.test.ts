import { readFileSync } from "node:fs";
import { join } from "node:path";

// resolveMpvVoDriver has its JVM test. This covers the session still asking
// it: the session used to start mpv on gpu-next whatever the config carried.
const session = readFileSync(
  join(
    __dirname,
    "../android/src/main/java/expo/modules/mpvplayer/nativeplayer/NativePlayerSession.kt",
  ),
  "utf8",
);

describe("the native session's mpv engine", () => {
  it("starts on the video output driver the config carries", () => {
    expect(session).toContain(
      "MPVLayerRenderer(activity, voDriver = resolveMpvVoDriver(config.voDriver))",
    );
    expect(session).not.toMatch(/voDriver = "/);
  });
});
