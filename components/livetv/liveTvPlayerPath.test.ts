import { liveTvPlayerPath } from "./liveTvPlayerPath";

const paramsOf = (path: string) => new URLSearchParams(path.split("?")[1]);

describe("liveTvPlayerPath", () => {
  // A route that names no quality plays at the default one, Auto included.
  test("asks the player for no cap, whatever the default quality", () => {
    expect(paramsOf(liveTvPlayerPath("channel-1")).get("bitrateValue")).toBe(
      "max",
    );
  });

  test("opens the player on the channel or program it is given", () => {
    const path = liveTvPlayerPath("program-1");

    expect(path.startsWith("/player/direct-player?")).toBe(true);
    expect(paramsOf(path).get("itemId")).toBe("program-1");
  });
});
