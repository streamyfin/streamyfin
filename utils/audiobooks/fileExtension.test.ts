import { audiobookFileExtension } from "./fileExtension";

describe("the extension a downloaded part is stored under", () => {
  // iOS reads a local file's format from its extension.
  test("an MP4 audio file is m4a, whichever name the prober gave it", () => {
    expect(audiobookFileExtension("m4b")).toBe("m4a");
    expect(audiobookFileExtension("mov,mp4,m4a,3gp,3g2,mj2")).toBe("m4a");
  });

  test("other containers keep their first name", () => {
    expect(audiobookFileExtension("mp3")).toBe("mp3");
    expect(audiobookFileExtension("ogg,opus")).toBe("ogg");
  });

  test("no container falls back to m4a", () => {
    expect(audiobookFileExtension(null)).toBe("m4a");
    expect(audiobookFileExtension("")).toBe("m4a");
  });
});
